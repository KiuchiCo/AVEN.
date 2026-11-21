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
import { AtomBlockView, EnvContext, SourceBlockView, SyncedBlockView, ToggleBlockView, type EditorEnv, type HostEnv } from './editor-nodeviews';
import { applyCellOp, type CellOp } from './table-rules';
import { blocksToDoc, hasInlineContent, nodeNameFor } from './editor-convert';
import { findMatches, locateBlocks, readDoc, reconcile, sameBlocks, selectBlock, selectionInBlock } from './editor-sync';
import type { BlockType, Align, FontFamily } from './editor-model';
import { commonStyle, clearStyle as clearRange, setFlag, setValue as setRangeValue, styleAt, wordAt, visibleSlice, type Flag } from './inline-style';
import { applySlash, blankBlock, contentOf, convertBlock, duplicateBlock, filterSlash, findSlash, indentBlock, keepsNewlines, makeLink, markdownShortcut, moveBlockBy, normalizeBlock, pasteLines, pressBackspaceAtStart, pressDeleteAtEnd, pressEnter, reorderBlock, toggleMark, type Block, type Mark, clearBlockFormatting, isFormattable, setLayout, isTextBlock } from './editor-model';
import { blockCatalog, catalogCategories, iconForBlock, type BlockCategory, type CatalogEntry } from './block-catalog';
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
  // formatting commands used by the toolbar; each acts on the selected text or the selected block(s)
  undo: () => void; redo: () => void; openFind: () => void;
  toggleMark: (mark: Mark) => void; setTone: (tone: string | null) => void;
  linkTarget: () => LinkTarget | null; applyLink: (url: string, target: LinkTarget) => boolean;
  setBlockType: (entry: Pick<CatalogEntry, 'type' | 'patch'>) => void; toggleList: (type: 'BULLET' | 'NUMBERED' | 'TODO') => void;
  setLayout: (patch: { align?: Align; spacing?: number; font?: FontFamily; size?: number }) => void;
  indent: (direction: 1 | -1) => void; clearFormatting: () => void; commentSelection: () => void;
  insertBlock: (type: BlockType, patch?: Partial<Block>) => void; tableOp: (op: TableOp) => void; blockOp: (op: BlockOp) => void; setHalf: (half: boolean) => void;
  setTitle: (title: string) => void; focus: () => void; replaceBlockFile: (fileId: string) => void;
};
/** What the formatting toolbar needs to know about the selection: what is active, what can be done, and which kind of block is selected. */
export type FormatState = {
  editable: boolean; ids: string[]; type: BlockType | null; kind: 'none' | 'text' | 'code' | 'image' | 'table' | 'atom';
  marks: string[]; colour: string | null; background: string | null; align: Align | null; spacing: number | null; font: FontFamily | null; size: number | null;
  hasSelection: boolean; canLayout: boolean; canIndent: boolean; canOutdent: boolean; canUndo: boolean; canRedo: boolean; half: boolean; rows: number; columns: number; find: boolean;
};
export const noFormat: FormatState = { editable: false, ids: [], type: null, kind: 'none', marks: [], colour: null, background: null, align: null, spacing: null, font: null, size: null, hasSelection: false, canLayout: false, canIndent: false, canOutdent: false, canUndo: false, canRedo: false, half: false, rows: 0, columns: 0, find: false };
export type LinkTarget = { id: string; start: number; end: number };
export type TableOp = CellOp | 'deleteTable';
export type BlockOp = 'duplicate' | 'delete' | 'up' | 'down';
export type LocalChange = { title: string; blocks: Block[]; previous: Block[] };
export type SelectionReport = { id: string | null; start: number; end: number; inline: boolean };

type Props = {
  title: string; blocks: Block[]; readOnly: boolean; env: HostEnv;
  cursors: LiveState['cursors']; others: LiveState['others'];
  onLocalChange: (change: LocalChange) => void; onSelection: (report: SelectionReport) => void;
  onCreateTask: (block: Block) => void; onComment: (block: Block, quote: string) => void; onMoveOut: (block: Block) => void; onNotice: (message: string) => void; onError: (message: string) => void;
  /** Runs one AI writing action. Null when AVEN Intelligence is not available to this person, so nothing AI is shown. */
  onAssist: ((request: AiRequest) => Promise<string>) | null;
  /** Told whenever the selection or the document changes, so the toolbar can show what is active. */
  onFormatState?: (state: FormatState) => void;
  /** Show the small bar that floats over selected text. The toolbar normally covers it, so it only appears when the toolbar is hidden. */
  floatingBar?: boolean;
  /** Cmd/Ctrl + K: the toolbar opens its link box. Without it the editor falls back to a prompt. */
  onLinkRequest?: () => void;
  /** Open comments, drawn on the words they were made on; clicking one asks the page to show it. */
  commentMarks?: LiveState['comments']; onCommentClick?: (id: string) => void;
  apiRef: Ref<DocEditorApi>;
};

/** The decorations plugin reads this object on every redraw, so it is updated in place. */
const share = (state: LiveState, patch: Partial<LiveState>) => { Object.assign(state, patch); };
/** A floating panel that stays inside the window: it moves left if it would pass the right edge and opens above the line if there is no room below. */
function Popover({ left, top, bar, children }: { left: number; top: number; bar?: boolean; children: ReactNode }) {
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
  return <div className={bar ? 'aven-popover aven-popover--bar' : 'aven-popover'} ref={box} style={{ left, top }}>{children}</div>;
}
const uuid = () => crypto.randomUUID();
const toolClass = 'aven-handle__menu';

export function DocEditor({ title, blocks, readOnly, env, cursors, others, onLocalChange, onSelection, onCreateTask, onComment, onMoveOut, onNotice, onError, onAssist, onFormatState, floatingBar = true, onLinkRequest, commentMarks, onCommentClick, apiRef }: Props) {
  const t = useT();
  const wrapper = useRef<HTMLDivElement>(null);
  const [live] = useState<LiveState>(emptyLive);
  const last = useRef<Block[]>(blocks);
  const latest = useRef({ onLocalChange, onSelection, readOnly, t, onError, onFormatState, onLinkRequest });
  useEffect(() => { latest.current = { onLocalChange, onSelection, readOnly, t, onError, onFormatState, onLinkRequest }; });
  const [slash, setSlash] = useState<{ blockId: string; start: number; query: string; index: number; left: number; top: number; category: BlockCategory | null } | null>(null);
  const [format, setFormat] = useState<{ left: number; top: number } | null>(null);
  const slashRef = useRef(slash); useEffect(() => { slashRef.current = slash; }, [slash]);
  const [ai, setAi] = useState<AiTarget | null>(null);
  const [picked, setPicked] = useState<{ ids: string[]; anchor: string; head: string } | null>(null);
  const pickedRef = useRef(picked); useEffect(() => { pickedRef.current = picked; }, [picked]);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [activeTabs, setActiveTabs] = useState<Record<string, number>>({});
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
  const handlers = useRef<{ keyDown: (event: KeyboardEvent) => boolean; textInput: (from: number, to: number, text: string) => boolean; paste: (event: ClipboardEvent) => boolean; gutterClick: (event: MouseEvent) => boolean; linkClick: (event: MouseEvent) => boolean; refreshAssist: () => void; reportSelection: () => void; pushFormat: () => void } | null>(null);
  const editor = useEditor({
    extensions, content: blocksToDoc(title, blocks), editable: !readOnly, immediatelyRender: false, shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: 'aven-doc', role: 'textbox', 'aria-multiline': 'true', 'aria-autocomplete': 'list', 'aria-haspopup': 'listbox', 'aria-label': t('ed.documentLabel'), spellcheck: 'true' },
      handleKeyDown: (_view, event) => handlers.current?.keyDown(event) ?? false,
      handleTextInput: (_view, from, to, text) => handlers.current?.textInput(from, to, text) ?? false,
      handlePaste: (_view, event) => handlers.current?.paste(event) ?? false,
      handleDOMEvents: { mousedown: (_view, event) => handlers.current?.gutterClick(event) ?? false },
      handleClick: (_view, _pos, event) => handlers.current?.linkClick(event) ?? false,
      // A block being dragged by its handle is moved by our own drop handler; the editor must not also insert its id as text.
      handleDrop: () => dragRef.current !== null,
    },
    onUpdate: ({ editor: ed, transaction }) => {
      if (findOpen.current) setDocVersion((value) => value + 1);
      if (transaction.getMeta('aven-external')) return;
      const read = readDoc(ed.state.doc);
      const previous = last.current; last.current = read.blocks;
      latest.current.onLocalChange({ title: read.title, blocks: read.blocks, previous });
      handlers.current?.refreshAssist(); handlers.current?.pushFormat();
    },
    onSelectionUpdate: () => { handlers.current?.refreshAssist(); handlers.current?.reportSelection(); handlers.current?.pushFormat(); },
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
      setSlash((current) => ({ blockId: sel.id, start: found.start, query: found.query, index: current && current.query === found.query && current.blockId === sel.id ? current.index : 0, left: spot.left, top: spot.top, category: current && current.blockId === sel.id ? current.category : null }));
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

  const slashChoices = (query: string, category: BlockCategory | null) => filterSlash(query, (item) => latest.current.t(`blk.${item.id}` as Key), readRecent()).filter((item) => !category || item.category === category);
  // The editor tells assistive technology when the slash menu is open and which entry is highlighted, since the focus stays in the text.
  useEffect(() => {
    const dom = editor?.view.dom; if (!dom) return;
    if (!slash) { dom.setAttribute('aria-expanded', 'false'); dom.removeAttribute('aria-controls'); dom.removeAttribute('aria-activedescendant'); return; }
    const entry = slashChoices(slash.query, slash.category)[slash.index];
    dom.setAttribute('aria-expanded', 'true'); dom.setAttribute('aria-controls', 'aven-slash-list'); if (entry) dom.setAttribute('aria-activedescendant', `aven-slash-${entry.id}`);
  }); // runs after every render: cheap, and must follow the menu on every change

  function chooseSlash(entry: CatalogEntry) {
    const open = slashRef.current; if (!editor || !open) return;
    const sel = selectionInBlock(editor.state);
    const result = applySlash(currentBlocks(), open.blockId, { start: open.start, query: open.query }, sel?.end ?? open.start + 1 + open.query.length, entry, uuid);
    setSlash(null); recordRecent(entry.id);
    if (result) commit(result.blocks, result.focus);
  }

  /** The text each block holds inside the selection, one entry per block, so a change can act on a selection that spans paragraphs. A caret is an empty range. */
  const textRanges = useCallback((): { id: string; start: number; end: number; text: string }[] => {
    if (!editor || pickedRef.current) return [];
    const { from, to } = editor.state.selection; const out: { id: string; start: number; end: number; text: string }[] = [];
    for (const { node, pos, id } of locateBlocks(editor.state.doc)) {
      const type = String(node.attrs.type);
      if (!hasInlineContent(node.type.name) || type === 'CODE' || type === 'EQUATION' || type === 'MERMAID' || node.type.name === 'syncedBlock') continue;
      const inner = pos + 1, size = node.content.size;
      if (to < inner || from > inner + size) continue;
      const start = Math.max(0, from - inner), end = Math.min(size, to - inner);
      if (from !== to && start === end) continue;
      out.push({ id, start, end, text: node.textContent });
    }
    return out;
  }, [editor]);

  /** Applies a change to every selected range (or, for a caret, the word it is in) and keeps the selection on the changed words. */
  function changeRanges(change: (range: { id: string; start: number; end: number; text: string }) => { text: string; start: number; end: number } | null, caretWord = true) {
    if (!editor) return false;
    let ranges = textRanges(); if (!ranges.length) return false;
    if (caretWord && ranges.length === 1 && ranges[0].start === ranges[0].end) {
      const word = wordAt(ranges[0].text, ranges[0].start); if (!word) return false;
      ranges = [{ ...ranges[0], start: word.start, end: word.end }];
    }
    const results = new Map<string, { text: string; start: number; end: number }>();
    for (const range of ranges) { const made = range.start === range.end ? null : change(range); if (made) results.set(range.id, made); }
    if (!results.size) return false;
    const first = [...results][0];
    commit(currentBlocks().map((block) => { const made = results.get(block.id); return made ? normalizeBlock({ ...block, text: made.text }) : block; }), { id: first[0], caret: first[1].start, end: first[1].end });
    return true;
  }

  function applyMark(mark: Mark) {
    if (!editor) return;
    const ranges = textRanges(); if (!ranges.length) return;
    if (ranges.length === 1 && ranges[0].start === ranges[0].end) { // a caret: an empty pair of marks to type inside
      const only = ranges[0]; const next = toggleMark(only.text, only.start, only.end, mark);
      commit(currentBlocks().map((block) => (block.id === only.id ? normalizeBlock({ ...block, text: next.text }) : block)), { id: only.id, caret: next.start, end: next.end }); return;
    }
    const flag = ({ highlight: 'mark' } as Record<string, Flag>)[mark] ?? (mark as Flag);
    const on = !ranges.every((range) => styleAt(range.text, range.start, range.end)[flag]);
    changeRanges((range) => setFlag(range.text, range.start, range.end, flag, on), false);
  }
  function applyColour(tone: string | null) {
    const kind = tone?.startsWith('bg-') ? 'bg' : 'tone'; const value = tone ? (kind === 'bg' ? tone.slice(3) : tone) : null;
    const ranges = textRanges(); const same = value !== null && ranges.length > 0 && ranges.every((range) => styleAt(range.text, range.start, range.end)[kind] === value);
    changeRanges((range) => {
      if (value === null) { const plain = setRangeValue(range.text, range.start, range.end, 'tone', null); return plain && setRangeValue(plain.text, plain.start, plain.end, 'bg', null); }
      return setRangeValue(range.text, range.start, range.end, kind, same ? null : value);
    });
  }
  /** Font and size of the selected words (not the whole paragraph); null removes it. True when there was a text selection to apply it to. */
  function applyInlineValue(key: 'font' | 'size', value: string | number | null): boolean {
    const ranges = textRanges(); if (!ranges.some((range) => range.end > range.start)) return false;
    return changeRanges((range) => setRangeValue(range.text, range.start, range.end, key, value), false);
  }
  function clearSelectionStyle() {
    if (pickedRef.current) { changeSelected((block) => (isTextBlock(block.type) ? clearBlockFormatting(block) : block)); return; }
    changeRanges((range) => clearRange(range.text, range.start, range.end));
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
    if (latest.current.onLinkRequest) { latest.current.onLinkRequest(); return; }
    const url = window.prompt(latest.current.t('ed.linkPrompt')); if (!url) return;
    const next = makeLink(sel.node.textContent, sel.start, sel.end, url);
    if (!next) { latest.current.onError(latest.current.t('ed.linkInvalid')); return; }
    commit(currentBlocks().map((block) => (block.id === sel.id ? normalizeBlock({ ...block, text: next.text }) : block)), { id: sel.id, caret: next.start, end: next.end });
  }


  // ---- formatting commands (the toolbar calls these through the editor's api) ------------------------------------------------------
  /** The blocks the selection touches: the blocks picked as a whole, or every block a text selection passes through. */
  const selectedIds = useCallback((): string[] => {
    if (!editor) return [];
    const chosen = pickedRef.current; if (chosen) return chosen.ids;
    const { from, to } = editor.state.selection;
    return locateBlocks(editor.state.doc).filter(({ node, pos }) => pos < Math.max(to, from + 1) && pos + node.nodeSize > from).map((entry) => entry.id);
  }, [editor]);
  const lastFormat = useRef('');
  const pushFormat = useCallback(() => {
    const report = latest.current.onFormatState; if (!editor || !report) return;
    const all = currentBlocks(); const ids = selectedIds();
    const chosen = ids.map((id) => all.find((block) => block.id === id)).filter((block): block is Block => Boolean(block));
    const first = chosen[0];
    const ranges = textRanges();
    const common = commonStyle(ranges.map((range) => styleAt(range.text, range.start, range.end)));
    const selectedText = ranges.some((range) => range.end > range.start);
    const kind: FormatState['kind'] = !first ? 'none' : first.type === 'TABLE' ? 'table' : first.type === 'IMAGE' ? 'image' : first.type === 'CODE' ? 'code' : isTextBlock(first.type) ? 'text' : 'atom';
    const shared = <K extends 'align' | 'spacing' | 'font' | 'size'>(key: K) => (chosen.length && chosen.every((block) => block[key] === first[key]) ? first[key] ?? null : null);
    const state: FormatState = {
      editable: !latest.current.readOnly, ids, type: first?.type ?? null, kind,
      marks: [common.bold && 'bold', common.italic && 'italic', common.strike && 'strike', common.underline && 'underline', common.mark && 'highlight', common.code && 'code', common.href && 'link'].filter(Boolean) as string[], colour: common.tone ?? null, background: common.bg ?? null,
      align: shared('align') as Align | null, spacing: shared('spacing') as number | null,
      // the words' own font and size win over the paragraph's, when words are selected
      font: (selectedText ? common.font : undefined) ?? shared('font') as FontFamily | null, size: (selectedText ? common.size : undefined) ?? shared('size') as number | null,
      hasSelection: selectedText, canLayout: chosen.length > 0 && chosen.every((block) => isFormattable(block.type)),
      canIndent: Boolean(first && indentBlock(all, first.id, 1)), canOutdent: Boolean(first && indentBlock(all, first.id, -1)),
      canUndo: editor.can().undo(), canRedo: editor.can().redo(), half: first?.span === 'half', rows: first?.rows?.length ?? 0, columns: first?.rows?.[0]?.length ?? 0, find: findOpen.current,
    };
    const key = JSON.stringify(state); if (key === lastFormat.current) return;
    lastFormat.current = key; report(state);
  }, [editor, currentBlocks, selectedIds, textRanges]);
  useEffect(() => { pushFormat(); }, [pushFormat, picked, find, readOnly, blocks]);

  function changeSelected(change: (block: Block) => Block) {
    const ids = selectedIds(); if (!ids.length) return;
    const all = currentBlocks(); const next = all.map((block) => (ids.includes(block.id) ? change(block) : block));
    if (JSON.stringify(next) !== JSON.stringify(all)) commit(next);
  }
  function setBlockType(entry: Pick<CatalogEntry, 'type' | 'patch'>) {
    changeSelected((block) => {
      if (!isTextBlock(block.type) || block.type === 'TOGGLE') return block;
      const { align, spacing, font, size, indent } = block;
      return normalizeBlock({ ...convertBlock(block, entry), align, spacing, font, size, indent });
    });
  }
  function toggleList(type: 'BULLET' | 'NUMBERED' | 'TODO') {
    const ids = selectedIds(); const all = currentBlocks();
    const chosen = all.filter((block) => ids.includes(block.id) && isTextBlock(block.type) && block.type !== 'TOGGLE' && block.type !== 'CODE');
    if (!chosen.length) return;
    const off = chosen.every((block) => block.type === type);
    setBlockType(off ? { type: 'PARAGRAPH' } : { type });
  }
  function indentSelected(direction: 1 | -1) {
    let next = currentBlocks(); const ids = selectedIds();
    for (const id of direction === 1 ? ids : [...ids].reverse()) { const changed = indentBlock(next, id, direction); if (changed) next = changed; }
    if (next !== currentBlocks()) commit(next);
  }
  function commentOnSelection() {
    if (!editor) return;
    const sel = selectionInBlock(editor.state); const block = sel ? currentBlocks().find((item) => item.id === sel.id) : currentBlocks().find((item) => item.id === selectedIds()[0]);
    if (!block) return;
    onComment(block, sel && sel.end > sel.start ? visibleSlice(block.text, sel.start, sel.end) : visibleSlice(block.text, 0, block.text.length));
  }
  function linkTarget(): LinkTarget | null { const sel = editor ? selectionInBlock(editor.state) : null; return sel?.inline ? { id: sel.id, start: sel.start, end: sel.end } : null; }
  function applyLinkTo(url: string, target: LinkTarget): boolean {
    const block = currentBlocks().find((item) => item.id === target.id); if (!block) return false;
    const next = makeLink(block.text, target.start, target.end, url); if (!next) { latest.current.onError(latest.current.t('ed.linkInvalid')); return false; }
    commit(currentBlocks().map((item) => (item.id === target.id ? normalizeBlock({ ...item, text: next.text }) : item)), { id: target.id, caret: next.start, end: next.end });
    return true;
  }
  function insertBlock(type: BlockType, patch?: Partial<Block>) {
    const all = currentBlocks(); const afterId = selectedIds().slice(-1)[0] ?? all[all.length - 1]?.id; const at = afterId ? all.findIndex((block) => block.id === afterId) : all.length - 1;
    const created = blankBlock(uuid(), type, patch);
    commit([...all.slice(0, at + 1), created, ...all.slice(at + 1)], { id: created.id, caret: 0 });
  }
  /** Where the caret last was inside a table; table operations act on that row and column. */
  const tableCell = useRef<{ id: string; row: number; col: number } | null>(null);
  function tableOp(op: TableOp) {
    const spot = tableCell.current; const picked = selectedIds()[0];
    const id = spot && currentBlocks().some((item) => item.id === spot.id) ? spot.id : picked;
    const block = currentBlocks().find((item) => item.id === id); if (!block || block.type !== 'TABLE' || !block.rows) return;
    if (op === 'deleteTable') { setPicked(null); tableCell.current = null; const rest = currentBlocks().filter((item) => item.id !== id); commit(rest.length ? rest : [blankBlock(uuid())]); return; }
    if (!spot || spot.id !== id) { onNotice(latest.current.t('tbl.pickCell')); return; }
    const done = applyCellOp(block.rows, op, spot.row, spot.col);
    if (done.rows === block.rows) { onNotice(latest.current.t('ed.tableLimit')); return; }
    tableCell.current = { id, row: done.row, col: done.col };
    commit(currentBlocks().map((item) => (item.id === id ? normalizeBlock({ ...item, rows: done.rows }) : item)));
  }
  function blockOp(op: BlockOp) {
    const all = currentBlocks(); const ids = selectedIds(); const id = ids[0]; if (!id) return;
    if (op === 'duplicate') { const result = duplicateBlock(all, id, uuid); if (result) commit(result.blocks, result.focus); }
    else if (op === 'up' || op === 'down') { const next = moveBlockBy(all, id, op === 'up' ? -1 : 1); if (next !== all) commit(next, { id, caret: 0 }); }
    else { const next = all.filter((block) => !ids.includes(block.id)); setPicked(null); commit(next.length ? next : [blankBlock(uuid())]); }
  }

  // ---- keyboard, typing, paste, clicks ----------------------------------------------------------------------------------------
  /** Picks the blocks from `anchor` to `head` (in document order). */
  function pickRange(all: Block[], anchor: string, head: string) {
    const a = all.findIndex((block) => block.id === anchor), h = all.findIndex((block) => block.id === head); if (a < 0 || h < 0) return;
    setPicked({ ids: all.slice(Math.min(a, h), Math.max(a, h) + 1).map((block) => block.id), anchor, head });
  }
  /** Keys while whole blocks are picked. Returns whether the key was used. */
  function pickedKey(event: KeyboardEvent, current: { ids: string[]; anchor: string; head: string }): boolean {
    const all = currentBlocks(); const mod = event.metaKey || event.ctrlKey;
    const first = all.findIndex((block) => block.id === current.ids[0]); const last = all.findIndex((block) => block.id === current.ids[current.ids.length - 1]);
    const chosen = all.filter((block) => current.ids.includes(block.id));
    const leave = (focus?: { id: string; caret: number }) => { setPicked(null); if (focus && editor) editor.view.dispatch(selectBlock(editor.state.tr, focus.id, focus.caret).scrollIntoView()); };
    if (event.key === 'Escape') { event.preventDefault(); leave(); return true; }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !mod) {
      event.preventDefault(); const down = event.key === 'ArrowDown'; const at = all.findIndex((block) => block.id === current.head);
      const next = all[Math.max(0, Math.min(all.length - 1, at + (down ? 1 : -1)))]; if (!next) return true;
      if (event.shiftKey) pickRange(all, current.anchor, next.id); else setPicked({ ids: [next.id], anchor: next.id, head: next.id });
      document.getElementById(`block-${next.id}`)?.scrollIntoView({ block: 'nearest' }); return true;
    }
    if (event.key === 'Backspace' || event.key === 'Delete' || (mod && event.key.toLowerCase() === 'x')) {
      event.preventDefault();
      if (mod) void navigator.clipboard?.writeText(chosen.map((block) => block.text).join('\n'));
      const rest = all.filter((block) => !current.ids.includes(block.id)); const near = rest[Math.min(first, rest.length - 1)];
      setPicked(null); commit(rest.length ? rest : [blankBlock(uuid())], near ? { id: near.id, caret: near.text.length } : undefined); return true;
    }
    if (mod && event.key.toLowerCase() === 'c') { event.preventDefault(); void navigator.clipboard?.writeText(chosen.map((block) => block.text).join('\n')); onNotice(latest.current.t('ed.copiedBlocks', { n: chosen.length })); return true; }
    if (mod && event.key.toLowerCase() === 'd') {
      event.preventDefault(); const copies = chosen.map((block) => ({ ...block, id: uuid() }));
      commit([...all.slice(0, last + 1), ...copies, ...all.slice(last + 1)]); setPicked({ ids: copies.map((block) => block.id), anchor: copies[0].id, head: copies[copies.length - 1].id }); return true;
    }
    if (event.key === 'Tab' && !mod) {
      event.preventDefault(); let next = all;
      for (const block of event.shiftKey ? [...chosen] : chosen) { const changed = indentBlock(next, block.id, event.shiftKey ? -1 : 1); if (changed) next = changed; }
      if (next !== all) commit(next); return true;
    }
    if (event.key === 'Enter') { event.preventDefault(); leave({ id: current.ids[0], caret: chosen[0]?.text.length ?? 0 }); return true; }
    if (event.key.length === 1 && !mod) setPicked(null); // typing carries on in the text as before
    return false;
  }

  function keyDown(event: KeyboardEvent): boolean {
    if (!editor || event.isComposing) return false;
    const { state } = editor;
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); const picked = editor.state.doc.textBetween(state.selection.from, state.selection.to); setFind((current) => ({ query: picked && !picked.includes('\n') ? picked : current?.query ?? '', replace: current?.replace ?? '', index: 0 })); return true; }
    if (latest.current.readOnly) return false;
    if (pickedRef.current && pickedKey(event, pickedRef.current)) return true;
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
      const items = slashChoices(open.query, open.category);
      if (event.altKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) { event.preventDefault(); const order: (BlockCategory | null)[] = [null, ...catalogCategories]; const at = order.indexOf(open.category); setSlash({ ...open, index: 0, category: order[(at + (event.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length] }); return true; }
      if (event.key === 'ArrowDown') { event.preventDefault(); setSlash({ ...open, index: items.length ? (open.index + 1) % items.length : 0 }); return true; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSlash({ ...open, index: items.length ? (open.index + items.length - 1) % items.length : 0 }); return true; }
      if (event.key === 'Escape') { event.preventDefault(); setSlash(null); return true; }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); const choice = items[open.index]; if (choice) chooseSlash(choice); else setSlash(null); return true; }
    }
    if (!sel.inline) {
      // a selected block (table, image, …): Enter adds a paragraph after it
      if (event.key === 'Enter') { event.preventDefault(); const parent = blocks[sel.index]; const into = parent && (parent.type === 'TABS' || parent.type === 'MEETING');
        // after tabs or meeting notes the new paragraph is their content (for tabs: in the tab that is showing); after anything else it is a sibling
        const at = into ? sel.index + contentOf(blocks, sel.index).length : sel.index;
        const fresh = into ? normalizeBlock({ ...blankBlock(uuid()), indent: (parent.indent ?? 0) + 1, tab: parent.type === 'TABS' ? activeTabs[parent.id] ?? 0 : 0 }) : blankBlock(uuid());
        const next = [...blocks.slice(0, at + 1), fresh, ...blocks.slice(at + 1)]; commit(next, { id: fresh.id, caret: 0 }); return true; }
      return false;
    }
    const type = String(sel.node.attrs.type);
    if (mod && !event.shiftKey && ['b', 'i', 'e', 'u'].includes(event.key.toLowerCase()) && type !== 'CODE') { event.preventDefault(); applyMark(event.key.toLowerCase() === 'b' ? 'bold' : event.key.toLowerCase() === 'i' ? 'italic' : event.key.toLowerCase() === 'u' ? 'underline' : 'code'); return true; }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'x') { event.preventDefault(); applyMark('strike'); return true; }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'h') { event.preventDefault(); applyMark('highlight'); return true; }
    if (mod && !event.shiftKey && event.key.toLowerCase() === 'k') { event.preventDefault(); applyLink(); return true; }
    if (mod && !event.shiftKey && event.key.toLowerCase() === 'd') { event.preventDefault(); const result = duplicateBlock(blocks, sel.id, uuid); if (result) commit(result.blocks, result.focus); return true; }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); const next = moveBlockBy(blocks, sel.id, event.key === 'ArrowUp' ? -1 : 1); if (next !== blocks) commit(next, { id: sel.id, caret: sel.start, end: sel.end }); return true; }
    if (event.key === 'Escape' && !open && !mod) { event.preventDefault(); setPicked({ ids: [sel.id], anchor: sel.id, head: sel.id }); return true; }
    if (event.key === 'Tab' && !mod) {
      const next = indentBlock(blocks, sel.id, event.shiftKey ? -1 : 1);
      if (next) { event.preventDefault(); commit(next, { id: sel.id, caret: sel.start, end: sel.end }); return true; }
      return type === 'BULLET' || type === 'NUMBERED' || type === 'TODO'; // list items keep Tab; elsewhere it moves focus as usual
    }
    if (event.key === 'Enter') {
      const result = pressEnter(blocks, sel.id, sel.start, sel.end, uuid, { mod, shift: event.shiftKey });
      if (result && type === 'TOGGLE') setFolded((current) => { if (!current.has(sel.id)) return current; const next = new Set(current); next.delete(sel.id); return next; });
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
    const current = pickedRef.current;
    if (current && event.shiftKey) { const id = (event.target as HTMLElement | null)?.closest('[data-block-id]')?.getAttribute('data-block-id'); if (id) { event.preventDefault(); pickRange(currentBlocks(), current.anchor, id); return true; } }
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

  useEffect(() => { handlers.current = { keyDown, textInput, paste, gutterClick, linkClick, refreshAssist, reportSelection, pushFormat }; });

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

  useEffect(() => {
    if (!editor) return;
    share(live, { comments: commentMarks ?? [] });
    editor.view.dispatch(editor.state.tr.setMeta(liveKey, 'refresh').setMeta('addToHistory', false).setMeta('aven-external', true));
  }, [commentMarks, editor, live]);
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
    askAi: () => { const sel = editor ? selectionInBlock(editor.state) : null; if (sel?.inline && sel.end > sel.start) openAiOnSelection(); else setAi({ kind: 'document' }); },
    blocks: currentBlocks,
    undo: () => { editor?.chain().focus().undo().run(); }, redo: () => { editor?.chain().focus().redo().run(); },
    openFind: () => { if (!editor) return; const picked = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to); setFind((current) => ({ query: picked && !picked.includes('\n') ? picked : current?.query ?? '', replace: current?.replace ?? '', index: 0 })); },
    toggleMark: (mark) => applyMark(mark), setTone: (tone) => applyColour(tone),
    linkTarget, applyLink: applyLinkTo, setBlockType, toggleList,
    setLayout: (patch) => {
      // font and size belong to the selected words; with nothing selected they set the paragraph's
      if (('font' in patch || 'size' in patch) && !pickedRef.current) { const key = 'font' in patch ? 'font' : 'size'; if (applyInlineValue(key, (patch[key] as string | number | undefined) ?? null)) return; }
      const ids = selectedIds(); const next = setLayout(currentBlocks(), ids, patch); if (next !== currentBlocks()) commit(next);
    },
    indent: indentSelected, clearFormatting: clearSelectionStyle,
    commentSelection: commentOnSelection, insertBlock, tableOp, blockOp,
    setHalf: (half) => changeSelected((block) => normalizeBlock({ ...block, span: half ? 'half' : undefined })),
    setTitle: (next) => { if (!editor) return; const tr = reconcile(editor.state.tr, currentBlocks(), next); editor.view.dispatch(tr); },
    focus: () => { editor?.view.focus(); },
    replaceBlockFile: (fileId) => changeSelected((block) => (block.type === 'IMAGE' ? normalizeBlock({ ...block, fileId }) : block)),
  }), [editor, commit, currentBlocks]); // eslint-disable-line react-hooks/exhaustive-deps -- the commands read the editor through refs and always see the latest document

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

  const full: EditorEnv = useMemo(() => ({
    ...env, placeholders, folded, activeTabs,
    onTableCell: (id: string, row: number, col: number) => { tableCell.current = { id, row, col }; },
    onFold: (id: string) => setFolded((current) => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; }),
    onTab: (id: string, index: number) => setActiveTabs((current) => ({ ...current, [id]: index })),
    appendLines: (parentId: string, lines: string[], type: BlockType = 'PARAGRAPH') => {
      const all = currentBlocks(); const at = all.findIndex((block) => block.id === parentId); if (at < 0) return;
      const end = at + contentOf(all, at).length; const kids = lines.filter((line) => line.trim()).map((line) => normalizeBlock({ ...blankBlock(uuid(), type), text: line.trim(), indent: (all[at].indent ?? 0) + 1 }));
      if (kids.length) commit([...all.slice(0, end + 1), ...kids, ...all.slice(end + 1)]);
    },
    contentActions: (parentId: string) => { const all = currentBlocks(); const at = all.findIndex((block) => block.id === parentId); return at < 0 ? [] : contentOf(all, at).filter((block) => block.type === 'TODO' && !block.checked && block.text.trim()).map((block) => block.text.trim()); },
    removeTab: (parentId: string, index: number) => {
      const all = currentBlocks(); const at = all.findIndex((block) => block.id === parentId); if (at < 0) return;
      const inside = new Set(contentOf(all, at).map((block) => block.id));
      commit(all.map((block) => (inside.has(block.id) && (block.tab ?? 0) >= index ? normalizeBlock({ ...block, tab: (block.tab ?? 0) === index ? Math.max(0, index - 1) : (block.tab ?? 0) - 1 }) : block)));
      setActiveTabs((current) => ({ ...current, [parentId]: Math.max(0, Math.min(current[parentId] ?? 0, index - 1)) }));
    },
  }), [env, placeholders, folded, activeTabs, currentBlocks, commit]);
  useEffect(() => {
    if (!editor) return;
    share(live, { picked: new Set(picked?.ids ?? []) });
    editor.view.dispatch(editor.state.tr.setMeta(liveKey, 'refresh').setMeta('addToHistory', false).setMeta('aven-external', true));
  }, [picked, editor, live]);
  useEffect(() => {
    if (!editor) return;
    share(live, { folded, tabs: activeTabs });
    editor.view.dispatch(editor.state.tr.setMeta(liveKey, 'refresh').setMeta('addToHistory', false).setMeta('aven-external', true));
  }, [folded, activeTabs, editor, live]);
  return <EnvContext.Provider value={full}>
    <div className="aven-editor" ref={wrapper} onClick={(event) => { const mark = (event.target as HTMLElement).closest?.<HTMLElement>('.md-commented'); if (mark && onCommentClick && window.getSelection()?.isCollapsed !== false) onCommentClick(mark.dataset.comment ?? ''); }} onMouseMove={onMove} onMouseLeave={() => { if (!dragRef.current) setHover(null); }} onDragOver={overBlock} onDrop={drop}>
      {ai && onAssist && <AiPanel target={ai} run={onAssist} onReplace={aiReplace} onInsert={aiInsert} onTasks={(titles) => env.createTasks(ai.kind === 'selection' ? ai.blockId : currentBlocks()[0]?.id ?? '', titles)} onClose={() => { setAi(null); editor?.view.focus(); }} />}
      {find && <FindBar query={find.query} replace={find.replace} count={matches.length} current={currentMatch} readOnly={readOnly} onQuery={(query) => setFind({ ...find, query, index: 0 })} onReplaceText={(replace) => setFind({ ...find, replace })} onStep={(step) => setFind({ ...find, index: currentMatch + step })} onReplace={replaceMatches} onClose={closeFind} />}
      {picked && <p className="sr-only" role="status">{t('ed.pickedCount', { n: picked.ids.length })}</p>}
      <EditorContent editor={editor} />
      {slash && <Popover left={slash.left} top={slash.top}><SlashMenu query={slash.query} index={slash.index} category={slash.category} onCategory={(category) => setSlash({ ...slash, category, index: 0 })} onPick={chooseSlash} onHover={(index) => setSlash({ ...slash, index })} /></Popover>}
      {format && floatingBar && <Popover left={format.left} top={format.top} bar><FormatBar onMark={applyMark} onLink={applyLink} onColour={applyColour} onAi={onAssist ? openAiOnSelection : undefined} /></Popover>}
      {!readOnly && hover && hoverBlock && <div className="aven-handle" style={{ top: hover.top }}>
        <button type="button" className="aven-handle__drag" draggable aria-label={t('ed.dragHandle')} title={t('ed.dragHandle')}
          onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', hover.id); setDrag({ id: hover.id, over: null }); }} onDragEnd={() => setDrag(null)}>⋮⋮</button>
        <details className="rd-menu aven-handle__more"><summary className="aven-handle__summary" aria-label={t('ed.blockMenu')}><BlockIcon id={iconForBlock(hoverBlock)} size={16} /></summary>
          <div className={`rd-menu__list ${toolClass}`}>
            <label className="rd-menu__field">{t('ed.turnInto')}<select value={iconForBlock(hoverBlock)} onChange={(event) => { const entry = turnInto.find((item) => item.id === event.target.value); if (entry) act((all, block) => commit(all.map((item) => (item.id === block.id ? convertBlock(item, entry) : item)), { id: block.id, caret: block.text.length })); }}>{turnInto.map((entry) => <option key={entry.id} value={entry.id}>{t(`blk.${entry.id}` as Key)}</option>)}</select></label>
            <button type="button" onClick={() => act((_all, block) => setPicked({ ids: [block.id], anchor: block.id, head: block.id }))}>{t('ed.selectBlock')}</button>
            <button type="button" onClick={() => act((all, block) => { const blank = blankBlock(uuid()); const at = all.findIndex((item) => item.id === block.id); commit([...all.slice(0, at), blank, ...all.slice(at)], { id: blank.id, caret: 0 }); })}>{t('ed.addAbove')}</button>
            <button type="button" onClick={() => act((all, block) => { const blank = blankBlock(uuid()); const at = all.findIndex((item) => item.id === block.id); commit([...all.slice(0, at + 1), blank, ...all.slice(at + 1)], { id: blank.id, caret: 0 }); })}>{t('ed.addBelow')}</button>
            <button type="button" onClick={() => act((all, block) => { const result = duplicateBlock(all, block.id, uuid); if (result) commit(result.blocks, result.focus); })}>{t('ed.duplicateBlock')}</button>
            <button type="button" onClick={() => act((all, block) => commit(moveBlockBy(all, block.id, -1), { id: block.id, caret: 0 }))}>{t('ed.moveUp')}</button>
            <button type="button" onClick={() => act((all, block) => commit(moveBlockBy(all, block.id, 1), { id: block.id, caret: 0 }))}>{t('ed.moveDown')}</button>
            {hoverBlock.type !== 'DIVIDER' && nodeNameFor(hoverBlock.type) === 'atomBlock' && !['TOC', 'BREADCRUMB', 'MEETING', 'TABS', 'BUTTON'].includes(hoverBlock.type) && <button type="button" onClick={() => act((all, block) => commit(all.map((item) => (item.id === block.id ? normalizeBlock({ ...item, span: item.span === 'half' ? undefined : 'half' }) : item))))}>{hoverBlock.span === 'half' ? t('ed.fullWidth') : t('ed.halfWidth')}</button>}
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
