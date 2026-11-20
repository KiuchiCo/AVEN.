'use client';

// The document editing surface: ONE rich-text editor (ProseMirror, through Tiptap) holding the title and every block as nodes of a single
// document. Paragraphs, headings, list items, quotes and the rest are text inside that document, not separate inputs. The editing rules
// (Enter, Backspace, slash commands, shortcuts, indent) are the tested functions in editor-model.ts, applied as small transactions.
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { Gapcursor, UndoRedo } from '@tiptap/extensions';
import { useT } from '../../../i18n';
import type { Key } from '../../../i18n/en';
import { Doc, Text, Title, TextBlock, UniqueBlockIds, Decorations, emptyLive, liveKey, type LiveState } from './editor-extensions';
import { AtomBlockView, EnvContext, SourceBlockView, SyncedBlockView, ToggleBlockView, type EditorEnv } from './editor-nodeviews';
import { blocksToDoc } from './editor-convert';
import { findMatches, locateBlocks, readDoc, reconcile, sameBlocks, selectBlock, selectionInBlock } from './editor-sync';
import { applySlash, blankBlock, convertBlock, duplicateBlock, filterSlash, findSlash, indentBlock, keepsNewlines, makeLink, markdownShortcut, moveBlockBy, normalizeBlock, pasteLines, pressBackspaceAtStart, pressDeleteAtEnd, pressEnter, reorderBlock, toggleMark, type Block, type Mark } from './editor-model';
import { blockCatalog, iconForBlock, type CatalogEntry } from './block-catalog';
import { BlockIcon } from '../../block-icons';
import { FormatBar, SlashMenu } from './editor-ui';
import { readRecent, recordRecent } from './recent-blocks';
import { FindBar } from './FindBar';
import { AiPanel, type AiRequest, type AiTarget } from './AiAssist';

export type DocEditorApi = {
  insertEntry: (entry: CatalogEntry, afterId?: string) => void;
  focusBlock: (id: string, caret?: number) => void;
  replaceBlock: (id: string, change: Partial<Block>) => void;
  currentBlockId: () => string | null;
  askAi: () => void;
  blocks: () => Block[];
};
export type LocalChange = { title: string; blocks: Block[]; previous: Block[] };
export type SelectionReport = { id: string | null; start: number; end: number; inline: boolean };

type Props = {
  title: string; blocks: Block[]; readOnly: boolean; env: Omit<EditorEnv, 'placeholders'>;
  cursors: LiveState['cursors']; others: LiveState['others'];
  onLocalChange: (change: LocalChange) => void; onSelection: (report: SelectionReport) => void;
  onCreateTask: (block: Block) => void; onComment: (block: Block, quote: string) => void; onMoveOut: (block: Block) => void; onNotice: (message: string) => void; onError: (message: string) => void;
  /** Runs one AI writing action. Null when AVEN Intelligence is not available to this person, so nothing AI is shown. */
  onAssist: ((request: AiRequest) => Promise<string>) | null;
  apiRef: Ref<DocEditorApi>;
};

/** The decorations plugin reads this object on every redraw, so it is updated in place. */
const share = (state: LiveState, patch: Partial<LiveState>) => { Object.assign(state, patch); };
/** A floating panel that stays inside the window: it moves left if it would pass the right edge and opens above the line if there is no room below. */
function Popover({ left, top, children }: { left: number; top: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    el.style.transform = ''; el.style.top = `${top}px`;
    const rect = el.getBoundingClientRect();
    const shiftX = Math.min(0, window.innerWidth - 8 - rect.right);
    const flip = rect.bottom > window.innerHeight - 8 && rect.top - rect.height - 34 > 8;
    if (flip) el.style.top = `${top - rect.height - 34}px`;
    if (shiftX) el.style.transform = `translateX(${shiftX}px)`;
  });
  return <div className="aven-popover" ref={box} style={{ left, top }}>{children}</div>;
}
const uuid = () => crypto.randomUUID();
const toolClass = 'aven-handle__menu';

export function DocEditor({ title, blocks, readOnly, env, cursors, others, onLocalChange, onSelection, onCreateTask, onComment, onMoveOut, onNotice, onError, onAssist, apiRef }: Props) {
  const t = useT();
  const wrapper = useRef<HTMLDivElement>(null);
  const [live] = useState<LiveState>(emptyLive);
  const last = useRef<Block[]>(blocks);
  const latest = useRef({ onLocalChange, onSelection, readOnly, t, onError });
  useEffect(() => { latest.current = { onLocalChange, onSelection, readOnly, t, onError }; });
  const [slash, setSlash] = useState<{ blockId: string; start: number; query: string; index: number; left: number; top: number } | null>(null);
  const [format, setFormat] = useState<{ left: number; top: number } | null>(null);
  const slashRef = useRef(slash); useEffect(() => { slashRef.current = slash; }, [slash]);
  const [ai, setAi] = useState<AiTarget | null>(null);
  const [docVersion, setDocVersion] = useState(0);
  const findOpen = useRef(false);
  const [find, setFind] = useState<{ query: string; replace: string; index: number } | null>(null);
  const [hover, setHover] = useState<{ id: string; top: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null);
  const dragRef = useRef(drag); useEffect(() => { dragRef.current = drag; }, [drag]);

  const placeholders = useMemo<Record<string, string>>(() => ({
    TITLE: t('ed.titlePh'), PARAGRAPH: t('ed.writePh'), HEADING_1: t('blk.heading-1'), HEADING_2: t('blk.heading-2'), HEADING_3: t('blk.heading-3'), HEADING_4: t('blk.heading-4'),
    BULLET: t('blk.bulleted-list'), NUMBERED: t('blk.numbered-list'), TODO: t('blk.todo-list'), QUOTE: t('blk.quote'), CODE: t('ed.phCode'), CALLOUT: t('ed.phCallout'),
  }), [t]);
  useEffect(() => { share(live, { placeholders }); }, [live, placeholders]);

  const extensions = useMemo(() => [Doc, Text, Title, TextBlock, ToggleBlockView, SourceBlockView, SyncedBlockView, AtomBlockView, UniqueBlockIds, Decorations.configure({ live: () => live }), UndoRedo, Gapcursor], [live]);

  // The editor is created once; its event handlers reach the latest versions of these functions through this ref.
  const handlers = useRef<{ keyDown: (event: KeyboardEvent) => boolean; textInput: (from: number, to: number, text: string) => boolean; paste: (event: ClipboardEvent) => boolean; gutterClick: (event: MouseEvent) => boolean; linkClick: (event: MouseEvent) => boolean; refreshAssist: () => void; reportSelection: () => void } | null>(null);
  const editor = useEditor({
    extensions, content: blocksToDoc(title, blocks), editable: !readOnly, immediatelyRender: false, shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: 'aven-doc', role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('ed.documentLabel'), spellcheck: 'true' },
      handleKeyDown: (_view, event) => handlers.current?.keyDown(event) ?? false,
      handleTextInput: (_view, from, to, text) => handlers.current?.textInput(from, to, text) ?? false,
      handlePaste: (_view, event) => handlers.current?.paste(event) ?? false,
      handleDOMEvents: { mousedown: (_view, event) => handlers.current?.gutterClick(event) ?? false },
      handleClick: (_view, _pos, event) => handlers.current?.linkClick(event) ?? false,
    },
    onUpdate: ({ editor: ed, transaction }) => {
      if (findOpen.current) setDocVersion((value) => value + 1);
      if (transaction.getMeta('aven-external')) return;
      const read = readDoc(ed.state.doc);
      const previous = last.current; last.current = read.blocks;
      latest.current.onLocalChange({ title: read.title, blocks: read.blocks, previous });
      handlers.current?.refreshAssist();
    },
    onSelectionUpdate: () => { handlers.current?.refreshAssist(); handlers.current?.reportSelection(); },
  });

  // ---- helpers that act on the editor ---------------------------------------------------------------------------------------
  const currentBlocks = useCallback(() => (editor ? readDoc(editor.state.doc).blocks : []), [editor]);
  /** Applies a new block list as a small transaction and puts the caret where the rule says. */
  const commit = useCallback((next: Block[], focus?: { id: string; caret: number; end?: number }) => {
    if (!editor) return;
    // Each rule (Enter, a Markdown shortcut, a mark, a move) is its own undo step, never merged into the typing before it.
    let tr = reconcile(editor.state.tr, next, null).setMeta('closeHistory', true);
    if (focus) tr = selectBlock(tr, focus.id, focus.caret, focus.end ?? focus.caret);
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
  }, [editor]);

  const coordsFor = useCallback((pos: number) => {
    if (!editor || !wrapper.current) return { left: 0, top: 0 };
    const box = wrapper.current.getBoundingClientRect(); const at = editor.view.coordsAtPos(pos);
    return { left: Math.max(0, at.left - box.left), top: at.bottom - box.top + 6, above: at.top - box.top - 40 };
  }, [editor]);

  /** Opens the slash menu or the formatting bar to match the selection. */
  const refreshAssist = useCallback(() => {
    if (!editor || latest.current.readOnly) { setSlash(null); setFormat(null); return; }
    const sel = selectionInBlock(editor.state);
    const type = sel?.node.attrs.type as string | undefined;
    const textual = sel?.inline && sel.node.type.name !== 'atomBlock' && type !== 'CODE' && type !== 'EQUATION' && type !== 'MERMAID';
    if (!sel || !textual) { setSlash(null); setFormat(null); return; }
    if (sel.start === sel.end) {
      setFormat(null);
      const found = findSlash(sel.node.textContent, sel.start);
      if (!found) { setSlash(null); return; }
      const spot = coordsFor(sel.pos + 1 + sel.start);
      setSlash((current) => ({ blockId: sel.id, start: found.start, query: found.query, index: current && current.query === found.query && current.blockId === sel.id ? current.index : 0, left: spot.left, top: spot.top }));
    } else {
      setSlash(null);
      const spot = coordsFor(sel.pos + 1 + sel.start); setFormat({ left: spot.left, top: Math.max(0, (spot as { above: number }).above) });
    }
  }, [editor, coordsFor]);

  const reportSelection = useCallback(() => {
    if (!editor) return;
    const sel = selectionInBlock(editor.state);
    latest.current.onSelection({ id: sel?.id ?? null, start: sel?.start ?? 0, end: sel?.end ?? 0, inline: sel?.inline ?? false });
  }, [editor]);

  const slashChoices = (query: string) => filterSlash(query, (item) => latest.current.t(`blk.${item.id}` as Key), readRecent());

  function chooseSlash(entry: CatalogEntry) {
    const open = slashRef.current; if (!editor || !open) return;
    const sel = selectionInBlock(editor.state);
    const result = applySlash(currentBlocks(), open.blockId, { start: open.start, query: open.query }, sel?.end ?? open.start + 1 + open.query.length, entry, uuid);
    setSlash(null); recordRecent(entry.id);
    if (result) commit(result.blocks, result.focus);
  }

  function applyMark(mark: Mark) {
    if (!editor) return;
    const sel = selectionInBlock(editor.state); if (!sel?.inline) return;
    const next = toggleMark(sel.node.textContent, sel.start, sel.end, mark);
    const blocks = currentBlocks().map((block) => (block.id === sel.id ? normalizeBlock({ ...block, text: next.text }) : block));
    commit(blocks, { id: sel.id, caret: next.start, end: next.end });
  }
  function openAiOnSelection() {
    if (!editor) return;
    const sel = selectionInBlock(editor.state);
    if (!sel?.inline || sel.start === sel.end) { onError(latest.current.t('ed.ai.selectOne')); return; }
    setAi({ kind: 'selection', blockId: sel.id, start: sel.start, end: sel.end, text: sel.node.textContent.slice(sel.start, sel.end) }); setFormat(null);
  }
  function aiReplace(text: string) {
    if (ai?.kind !== 'selection') return;
    const result = pasteLines(currentBlocks(), ai.blockId, ai.start, ai.end, text, uuid); if (result) commit(result.blocks, result.focus);
  }
  function aiInsert(text: string) {
    const blocks = currentBlocks(); const id = ai?.kind === 'selection' ? ai.blockId : blocks[blocks.length - 1]?.id; const block = blocks.find((item) => item.id === id); if (!block) return;
    const result = pasteLines(blocks, block.id, block.text.length, block.text.length, `\n${text}`, uuid); if (result) commit(result.blocks, result.focus);
  }
  function applyLink() {
    if (!editor) return;
    const sel = selectionInBlock(editor.state); if (!sel?.inline) return;
    const url = window.prompt(latest.current.t('ed.linkPrompt')); if (!url) return;
    const next = makeLink(sel.node.textContent, sel.start, sel.end, url);
    if (!next) { latest.current.onError(latest.current.t('ed.linkInvalid')); return; }
    commit(currentBlocks().map((block) => (block.id === sel.id ? normalizeBlock({ ...block, text: next.text }) : block)), { id: sel.id, caret: next.start, end: next.end });
  }

  // ---- keyboard, typing, paste, clicks ----------------------------------------------------------------------------------------
  function keyDown(event: KeyboardEvent): boolean {
    if (!editor || event.isComposing) return false;
    const { state } = editor;
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); const picked = editor.state.doc.textBetween(state.selection.from, state.selection.to); setFind((current) => ({ query: picked && !picked.includes('\n') ? picked : current?.query ?? '', replace: current?.replace ?? '', index: 0 })); return true; }
    if (latest.current.readOnly) return false;
    // Select all: the first press selects the body, the second one the whole page including the title, so deleting never takes the title by accident.
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'a' && state.selection.$from.parent.type.name !== 'title') {
      const bodyStart = state.doc.firstChild ? state.doc.firstChild.nodeSize + 1 : 1;
      const all = state.selection.from <= bodyStart && state.selection.to >= state.doc.content.size - 1;
      if (!all) { event.preventDefault(); editor.view.dispatch(state.tr.setSelection(TextSelection.between(state.doc.resolve(bodyStart), state.doc.resolve(state.doc.content.size - 1)))); return true; }
    }
    // Enter in the title carries on into the first block.
    if (state.selection.$from.depth >= 1 && state.selection.$from.parent.type.name === 'title') {
      if (event.key === 'Enter') { event.preventDefault(); const first = locateBlocks(state.doc)[0]; if (first) editor.view.dispatch(selectBlock(state.tr, first.id, 0)); return true; }
      return false;
    }
    const sel = selectionInBlock(state); if (!sel) return false;
    const mod = event.metaKey || event.ctrlKey; const open = slashRef.current;
    const blocks = currentBlocks();
    if (open && sel.inline && open.blockId === sel.id) {
      const items = slashChoices(open.query);
      if (event.key === 'ArrowDown') { event.preventDefault(); setSlash({ ...open, index: items.length ? (open.index + 1) % items.length : 0 }); return true; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSlash({ ...open, index: items.length ? (open.index + items.length - 1) % items.length : 0 }); return true; }
      if (event.key === 'Escape') { event.preventDefault(); setSlash(null); return true; }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); const choice = items[open.index]; if (choice) chooseSlash(choice); else setSlash(null); return true; }
    }
    if (!sel.inline) {
      // a selected block (table, image, …): Enter adds a paragraph after it
      if (event.key === 'Enter') { event.preventDefault(); const fresh = blankBlock(uuid()); const next = [...blocks.slice(0, sel.index + 1), fresh, ...blocks.slice(sel.index + 1)]; commit(next, { id: fresh.id, caret: 0 }); return true; }
      return false;
    }
    const type = String(sel.node.attrs.type);
    if (mod && !event.shiftKey && ['b', 'i', 'e', 'u'].includes(event.key.toLowerCase()) && type !== 'CODE') { event.preventDefault(); applyMark(event.key.toLowerCase() === 'b' ? 'bold' : event.key.toLowerCase() === 'i' ? 'italic' : event.key.toLowerCase() === 'u' ? 'underline' : 'code'); return true; }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'x') { event.preventDefault(); applyMark('strike'); return true; }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'h') { event.preventDefault(); applyMark('highlight'); return true; }
    if (mod && !event.shiftKey && event.key.toLowerCase() === 'k') { event.preventDefault(); applyLink(); return true; }
    if (mod && !event.shiftKey && event.key.toLowerCase() === 'd') { event.preventDefault(); const result = duplicateBlock(blocks, sel.id, uuid); if (result) commit(result.blocks, result.focus); return true; }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); const next = moveBlockBy(blocks, sel.id, event.key === 'ArrowUp' ? -1 : 1); if (next !== blocks) commit(next, { id: sel.id, caret: sel.start, end: sel.end }); return true; }
    if (event.key === 'Tab' && !mod) {
      const next = indentBlock(blocks, sel.id, event.shiftKey ? -1 : 1);
      if (next) { event.preventDefault(); commit(next, { id: sel.id, caret: sel.start, end: sel.end }); return true; }
      return type === 'BULLET' || type === 'NUMBERED' || type === 'TODO'; // list items keep Tab; elsewhere it moves focus as usual
    }
    if (event.key === 'Enter') {
      const result = pressEnter(blocks, sel.id, sel.start, sel.end, uuid, { mod, shift: event.shiftKey });
      if (result) { event.preventDefault(); commit(result.blocks, result.focus); return true; }
      if (event.shiftKey || keepsNewlines(type as never)) { event.preventDefault(); editor.view.dispatch(state.tr.insertText('\n').scrollIntoView()); return true; }
      return false;
    }
    if (event.key === 'Backspace' && sel.start === 0 && sel.end === 0) {
      // a list item at the left edge un-nests before it turns back into text
      const outdented = indentBlock(blocks, sel.id, -1);
      if (outdented) { event.preventDefault(); commit(outdented, { id: sel.id, caret: 0 }); return true; }
      const result = pressBackspaceAtStart(blocks, sel.id);
      if (result) { event.preventDefault(); commit(result.blocks, result.focus); return true; }
      return false;
    }
    if (event.key === 'Delete' && sel.start === sel.end && sel.end === sel.node.content.size) {
      const result = pressDeleteAtEnd(blocks, sel.id);
      if (result) { event.preventDefault(); commit(result.blocks, result.focus); return true; }
    }
    return false;
  }

  function textInput(from: number, to: number, text: string): boolean {
    if (!editor || latest.current.readOnly || text !== ' ') return false;
    const sel = selectionInBlock(editor.state);
    if (!sel?.inline || sel.node.type.name !== 'textBlock' || sel.node.attrs.type !== 'PARAGRAPH') return false;
    const full = `${sel.node.textContent.slice(0, sel.start)} ${sel.node.textContent.slice(sel.end)}`;
    const blocks = currentBlocks(); const block = blocks[sel.index]; if (!block) return false;
    const change = markdownShortcut(block, full); if (!change) return false;
    commit(blocks.map((item, index) => (index === sel.index ? normalizeBlock({ ...item, ...change }) : item)), { id: sel.id, caret: 0 });
    return true;
  }

  function paste(event: ClipboardEvent): boolean {
    if (!editor || latest.current.readOnly) return false;
    const text = event.clipboardData?.getData('text/plain') ?? ''; if (!text.includes('\n')) return false;
    const sel = selectionInBlock(editor.state); if (!sel?.inline) return false;
    const result = pasteLines(currentBlocks(), sel.id, sel.start, sel.end, text, uuid);
    if (!result) return false;
    event.preventDefault(); commit(result.blocks, result.focus); return true;
  }

  function gutterClick(event: MouseEvent): boolean {
    const target = event.target as HTMLElement | null;
    const gutter = target?.closest('.aven-gutter'); const block = target?.closest('.aven-block[data-type="TODO"]');
    if (!editor || !gutter || !block || latest.current.readOnly) return false;
    event.preventDefault();
    const id = block.getAttribute('data-block-id'); if (!id) return true;
    commit(currentBlocks().map((item) => (item.id === id ? normalizeBlock({ ...item, checked: !item.checked }) : item)));
    return true;
  }

  function linkClick(event: MouseEvent): boolean {
    const link = (event.target as HTMLElement | null)?.closest('.md-link'); const href = link?.getAttribute('data-href');
    if (!href || !(event.metaKey || event.ctrlKey)) return false;
    window.open(href, '_blank', 'noopener,noreferrer'); return true;
  }

  useEffect(() => { handlers.current = { keyDown, textInput, paste, gutterClick, linkClick, refreshAssist, reportSelection }; });

  // ---- keep the editor in step with the block list ------------------------------------------------------------------------------
  useEffect(() => {
    if (!editor) return;
    const current = readDoc(editor.state.doc);
    if (blocks === last.current && current.title === title) return;
    if (current.title === title && sameBlocks(current.blocks, blocks)) { last.current = current.blocks; return; }
    const tr = reconcile(editor.state.tr, blocks, title);
    tr.setMeta('aven-external', true); tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
    last.current = readDoc(editor.state.doc).blocks;
  }, [blocks, title, editor]);

  useEffect(() => { editor?.setEditable(!readOnly); }, [editor, readOnly]);
  useEffect(() => {
    if (!editor) return;
    share(live, { cursors, others });
    editor.view.dispatch(editor.state.tr.setMeta(liveKey, 'refresh').setMeta('addToHistory', false).setMeta('aven-external', true));
  }, [cursors, others, editor, live]);

  useEffect(() => { findOpen.current = find !== null; }, [find]);
  // Find in document: the highlighted matches are decorations, so they follow edits; the current one is picked by `find.index`.
  const matches = useMemo(() => (editor && find?.query ? findMatches(editor.state.doc, find.query) : []), [editor, find?.query, docVersion]); // eslint-disable-line react-hooks/exhaustive-deps -- docVersion stands for "the document changed"
  const currentMatch = matches.length ? ((find?.index ?? 0) % matches.length + matches.length) % matches.length : 0;
  useEffect(() => {
    if (!editor) return;
    share(live, { find: find?.query ? { query: find.query, current: currentMatch } : null });
    editor.view.dispatch(editor.state.tr.setMeta(liveKey, 'refresh').setMeta('addToHistory', false).setMeta('aven-external', true));
    const hit = matches[currentMatch];
    if (hit) { const node = editor.view.domAtPos(hit.from).node; (node instanceof Element ? node : node.parentElement)?.scrollIntoView({ block: 'center' }); }
  }, [editor, live, find?.query, currentMatch, matches]);
  function replaceMatches(all: boolean) {
    if (!editor || !find) return;
    const targets = all ? matches : matches.slice(currentMatch, currentMatch + 1); if (!targets.length) return;
    const tr = editor.state.tr;
    for (const range of [...targets].reverse()) { if (find.replace) tr.insertText(find.replace, range.from, range.to); else tr.delete(range.from, range.to); }
    editor.view.dispatch(tr);
    if (all) onNotice(t('ed.replacedCount', { n: targets.length }));
  }
  function closeFind() { setFind(null); editor?.view.focus(); }
  // Escape closes the find bar wherever the focus has gone (a disabled button hands it back to the page).
  useEffect(() => {
    if (!find) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setFind(null); editor?.view.focus(); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [find === null, editor]); // eslint-disable-line react-hooks/exhaustive-deps -- only whether it is open matters

  useImperativeHandle(apiRef, () => ({
    insertEntry: (entry, afterId) => {
      if (!editor) return;
      const all = currentBlocks(); const at = afterId ? all.findIndex((block) => block.id === afterId) : all.length - 1;
      const created = blankBlock(uuid(), entry.type, entry.patch);
      const next = [...all.slice(0, at + 1), created, ...all.slice(at + 1)];
      commit(next, { id: created.id, caret: 0 });
    },
    focusBlock: (id, caret = 0) => { if (editor) { editor.view.dispatch(selectBlock(editor.state.tr, id, caret).scrollIntoView()); editor.view.focus(); } },
    replaceBlock: (id, change) => { const all = currentBlocks(); commit(all.map((block) => (block.id === id ? normalizeBlock({ ...block, ...change }) : block))); },
    currentBlockId: () => (editor ? selectionInBlock(editor.state)?.id ?? null : null),
    askAi: () => setAi({ kind: 'document' }),
    blocks: currentBlocks,
  }), [editor, commit, currentBlocks]);

  // ---- block handle (drag, turn into, move, duplicate, delete) --------------------------------------------------------------------
  function onMove(event: React.MouseEvent) {
    if (latest.current.readOnly || dragRef.current) return;
    const el = (event.target as HTMLElement).closest('[data-block-id]') as HTMLElement | null;
    if (!el || !wrapper.current) { return; }
    const id = el.getAttribute('data-block-id'); if (!id) return;
    const top = el.getBoundingClientRect().top - wrapper.current.getBoundingClientRect().top;
    setHover((current) => (current && current.id === id && current.top === top ? current : { id, top }));
  }
  function overBlock(event: React.DragEvent) {
    if (!dragRef.current || !editor) return;
    event.preventDefault();
    let over: string | null = null;
    for (const entry of locateBlocks(editor.state.doc)) {
      const dom = editor.view.nodeDOM(entry.pos) as HTMLElement | null; if (!dom) continue;
      const rect = dom.getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) { over = entry.id; break; }
    }
    setDrag((current) => (current ? { ...current, over } : current));
  }
  function drop(event: React.DragEvent) {
    const state = dragRef.current; if (!state) return;
    event.preventDefault(); setDrag(null);
    const all = currentBlocks(); const next = reorderBlock(all, state.id, state.over);
    if (next !== all) commit(next, { id: state.id, caret: 0 });
  }
  const hoverBlock = hover ? currentBlocks().find((block) => block.id === hover.id) : undefined;
  function act(run: (blocks: Block[], block: Block) => void) { if (!hoverBlock) return; run(currentBlocks(), hoverBlock); }
  const turnInto = blockCatalog.filter((entry) => entry.id !== 'database-inline' && entry.id !== 'database-linked');

  const full: EditorEnv = useMemo(() => ({ ...env, placeholders }), [env, placeholders]);
  return <EnvContext.Provider value={full}>
    <div className="aven-editor" ref={wrapper} onMouseMove={onMove} onMouseLeave={() => { if (!dragRef.current) setHover(null); }} onDragOver={overBlock} onDrop={drop}>
      {ai && onAssist && <AiPanel target={ai} run={onAssist} onReplace={aiReplace} onInsert={aiInsert} onTasks={(titles) => env.createTasks(ai.kind === 'selection' ? ai.blockId : currentBlocks()[0]?.id ?? '', titles)} onClose={() => { setAi(null); editor?.view.focus(); }} />}
      {find && <FindBar query={find.query} replace={find.replace} count={matches.length} current={currentMatch} readOnly={readOnly} onQuery={(query) => setFind({ ...find, query, index: 0 })} onReplaceText={(replace) => setFind({ ...find, replace })} onStep={(step) => setFind({ ...find, index: currentMatch + step })} onReplace={replaceMatches} onClose={closeFind} />}
      <EditorContent editor={editor} />
      {slash && <Popover left={slash.left} top={slash.top}><SlashMenu query={slash.query} index={slash.index} onPick={chooseSlash} onHover={(index) => setSlash({ ...slash, index })} /></Popover>}
      {format && <div className="aven-popover aven-popover--bar" style={{ left: format.left, top: format.top }}><FormatBar onMark={applyMark} onLink={applyLink} onAi={onAssist ? openAiOnSelection : undefined} /></div>}
      {!readOnly && hover && hoverBlock && <div className="aven-handle" style={{ top: hover.top }}>
        <button type="button" className="aven-handle__drag" draggable aria-label={t('ed.dragHandle')} title={t('ed.dragHandle')}
          onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', hover.id); setDrag({ id: hover.id, over: null }); }} onDragEnd={() => setDrag(null)}>⋮⋮</button>
        <details className="rd-menu aven-handle__more"><summary className="aven-handle__summary" aria-label={t('ed.blockMenu')}><BlockIcon id={iconForBlock(hoverBlock)} size={16} /></summary>
          <div className={`rd-menu__list ${toolClass}`}>
            <label className="rd-menu__field">{t('ed.turnInto')}<select value={iconForBlock(hoverBlock)} onChange={(event) => { const entry = turnInto.find((item) => item.id === event.target.value); if (entry) act((all, block) => commit(all.map((item) => (item.id === block.id ? convertBlock(item, entry) : item)), { id: block.id, caret: block.text.length })); }}>{turnInto.map((entry) => <option key={entry.id} value={entry.id}>{t(`blk.${entry.id}` as Key)}</option>)}</select></label>
            <button type="button" onClick={() => act((all, block) => { const blank = blankBlock(uuid()); const at = all.findIndex((item) => item.id === block.id); commit([...all.slice(0, at), blank, ...all.slice(at)], { id: blank.id, caret: 0 }); })}>{t('ed.addAbove')}</button>
            <button type="button" onClick={() => act((all, block) => { const blank = blankBlock(uuid()); const at = all.findIndex((item) => item.id === block.id); commit([...all.slice(0, at + 1), blank, ...all.slice(at + 1)], { id: blank.id, caret: 0 }); })}>{t('ed.addBelow')}</button>
            <button type="button" onClick={() => act((all, block) => { const result = duplicateBlock(all, block.id, uuid); if (result) commit(result.blocks, result.focus); })}>{t('ed.duplicateBlock')}</button>
            <button type="button" onClick={() => act((all, block) => commit(moveBlockBy(all, block.id, -1), { id: block.id, caret: 0 }))}>{t('ed.moveUp')}</button>
            <button type="button" onClick={() => act((all, block) => commit(moveBlockBy(all, block.id, 1), { id: block.id, caret: 0 }))}>{t('ed.moveDown')}</button>
            <button type="button" onClick={() => act((_all, block) => { void navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}#block-${block.id}`).then(() => onNotice(t('ed.blockLinkCopied'))).catch(() => onError(t('bl.syncCopyFailed'))); })}>{t('ed.copyBlockLink')}</button>
            <button type="button" onClick={() => act((_all, block) => { const picked = editor ? selectionInBlock(editor.state) : null; const quote = picked && picked.end > picked.start ? block.text.slice(picked.start, picked.end) : block.text; onComment(block, quote.trim().slice(0, 200)); })}>{t('ed.addComment')}</button>
            <button type="button" onClick={() => act((_all, block) => onMoveOut(block))}>{t('ed.moveToDoc')}</button>
            {(hoverBlock.type === 'TODO' || hoverBlock.type === 'PARAGRAPH') && hoverBlock.text.trim() && <button type="button" onClick={() => act((_all, block) => onCreateTask(block))}>{t('ed.createTask')}</button>}
            <button type="button" className="is-danger" onClick={() => act((all, block) => { const next = all.filter((item) => item.id !== block.id); commit(next.length ? next : [blankBlock(uuid())]); setHover(null); })}>{t('ed.deleteBlock')}</button>
          </div></details>
      </div>}
      {drag && <p className="aven-drag-hint" role="status">{t('ed.dragging')}</p>}
    </div>
  </EnvContext.Provider>;
}
