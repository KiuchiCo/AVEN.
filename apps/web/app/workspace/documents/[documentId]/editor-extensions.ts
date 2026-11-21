// The editor's document schema and the plugins that give it its behaviour. One document: a title, then one node per block.
// Inline formatting is kept as Markdown marks inside the text (`**bold**`), shown formatted by decorations, so the text of a node is
// exactly the text of its block and live co-editing can stay character-accurate.
import { Extension, Node } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { hiddenIds, inlineRanges } from './editor-model.ts';
import { cellsOf } from './inline-style.ts';

/** Where `quote` (as it reads, without formatting marks) sits in a block's raw text, as raw offsets. */
export function findQuote(raw: string, quote: string): { start: number; end: number } | null {
  const cells = cellsOf(raw); const words = cells.map((cell) => cell.ch).join('');
  const at = words.indexOf(quote);
  return at < 0 || !quote ? null : { start: cells[at].src, end: cells[at + quote.length - 1].src + 1 };
}
import { findMatches, selectionInBlock } from './editor-sync.ts';

export type LiveState = {
  cursors: Record<string, { userId: string; name: string; start: number; end: number; colour: string }[]>;
  others: Record<string, { name: string; colour: string }>;
  placeholders: Record<string, string>;
  /** Find in document: what is searched for and which match is the current one. */
  find: { query: string; current: number } | null;
  /** Toggles that are closed, and which tab each tabs block is showing: the content they hide is folded away. */
  folded: ReadonlySet<string>; tabs: Readonly<Record<string, number>>;
  /** Blocks picked as whole blocks (Esc, then Shift + arrows), to act on together. */
  picked: ReadonlySet<string>;
  /** Open comments: the block each is about and the words it quotes, drawn as a highlight so a comment stays on its text. */
  comments: { id: string; blockId: string; quote: string }[];
};
export const emptyLive = (): LiveState => ({ cursors: {}, others: {}, placeholders: {}, find: null, folded: new Set(), tabs: {}, picked: new Set(), comments: [] });

export const Doc = Node.create({ name: 'doc', topNode: true, content: 'title block+' });
export const Text = Node.create({ name: 'text', group: 'inline' });
export const Title = Node.create({
  name: 'title', content: 'text*', marks: '', defining: true, selectable: false,
  parseHTML: () => [{ tag: 'h1.aven-title' }],
  renderHTML: () => ['h1', { class: 'aven-title' }, 0],
});

const headingLevel = (type: string) => ({ HEADING_1: 1, HEADING_2: 2, HEADING_3: 3, HEADING_4: 4 } as Record<string, number>)[type];

/** Paragraphs, headings, list items, to-dos, quotes, code and callouts: one node, told apart by `type`, with the text as its content. */
export const TextBlock = Node.create({
  name: 'textBlock', group: 'block', content: 'text*', marks: '', defining: true,
  addAttributes() { return { blockId: { default: null }, type: { default: 'PARAGRAPH' }, checked: { default: false }, indent: { default: 0 }, tab: { default: 0 }, align: { default: null }, spacing: { default: null }, font: { default: null }, size: { default: null } }; },
  parseHTML() { return [{ tag: 'div[data-block-id]' }]; },
  renderHTML({ node }) {
    const { blockId, type, checked, indent, align, spacing, font, size } = node.attrs as { blockId: string; type: string; checked: boolean; indent: number; align: string | null; spacing: number | null; font: string | null; size: number | null };
    const level = headingLevel(type);
    const style = [size ? `--b-size:${size}px` : '', spacing ? `--b-lh:${spacing}` : ''].filter(Boolean).join(';');
    return ['div', { id: `block-${blockId}`, class: `aven-block aven-${type.toLowerCase()}`, 'data-block-id': blockId, 'data-type': type, 'data-indent': String(indent ?? 0), ...(type === 'TODO' ? { 'data-checked': String(checked === true) } : {}), ...(level ? { role: 'heading', 'aria-level': String(level) } : {}),
      ...(align ? { 'data-align': align } : {}), ...(font ? { 'data-font': font } : {}), ...(size ? { 'data-size': String(size) } : {}), ...(spacing ? { 'data-spacing': String(spacing) } : {}), ...(style ? { style } : {}) },
      ['span', { class: 'aven-gutter', contenteditable: 'false' }], ['div', { class: 'aven-content' }, 0]];
  },
});

const blockOf = (name: string, content: string, attrs: Record<string, { default: unknown }>) => Node.create({
  name, group: 'block', content, marks: '', defining: true,
  addAttributes() { return { blockId: { default: null }, type: { default: 'PARAGRAPH' }, indent: { default: 0 }, tab: { default: 0 }, ...attrs }; },
  parseHTML() { return [{ tag: `div[data-node="${name}"]` }]; },
  renderHTML({ node }) { return ['div', { id: `block-${node.attrs.blockId}`, class: `aven-block aven-${String(node.attrs.type).toLowerCase()}`, 'data-node': name, 'data-block-id': String(node.attrs.blockId), 'data-type': String(node.attrs.type), 'data-indent': String(node.attrs.indent ?? 0) }, ...(content ? [['div', { class: 'aven-content' }, 0]] : [])] as never; },
});
export const ToggleBlock = blockOf('toggleBlock', 'text*', { level: { default: 0 }, body: { default: '' } });
export const SourceBlock = blockOf('sourceBlock', 'text*', {});
export const SyncedBlock = blockOf('syncedBlock', 'text*', { syncId: { default: null } });
export const AtomBlock = Node.create({
  name: 'atomBlock', group: 'block', atom: true, selectable: true, draggable: false,
  addAttributes() {
    const keys = ['text', 'rows', 'fileId', 'level', 'body', 'url', 'docId', 'databaseId', 'view', 'create', 'linked', 'tabs', 'date', 'attendees', 'actions', 'span'];
    return { blockId: { default: null }, type: { default: 'DIVIDER' }, indent: { default: 0 }, tab: { default: 0 }, ...Object.fromEntries(keys.map((key) => [key, { default: key === 'text' ? '' : undefined }])) };
  },
  parseHTML() { return [{ tag: 'div[data-node="atomBlock"]' }]; },
  renderHTML({ node }) { return ['div', { id: `block-${node.attrs.blockId}`, class: `aven-block aven-${String(node.attrs.type).toLowerCase()}`, 'data-node': 'atomBlock', 'data-block-id': String(node.attrs.blockId), 'data-type': String(node.attrs.type), 'data-indent': String(node.attrs.indent ?? 0) }]; },
});

/** Every block keeps its own id: a split or a paste that copies one is given a fresh one, so ids stay unique. */
export const UniqueBlockIds = Extension.create({
  name: 'uniqueBlockIds',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('uniqueBlockIds'),
      appendTransaction(transactions, _before, state) {
        if (!transactions.some((transaction) => transaction.docChanged)) return null;
        const seen = new Set<string>(); let tr: ReturnType<typeof state.tr.setNodeMarkup> | null = null;
        state.doc.forEach((node, offset, index) => {
          if (index === 0) return;
          const id = node.attrs.blockId as string | null;
          if (!id || seen.has(id)) { tr ??= state.tr; tr.setNodeMarkup(offset, undefined, { ...node.attrs, blockId: crypto.randomUUID() }); } else seen.add(id);
        });
        return tr;
      },
    })];
  },
});

const noMarks = new Set(['CODE', 'EQUATION', 'MERMAID']);
/** How one styled range is drawn: classes for marks and colours, and the one style that has no class (an exact size). */
function inlineAttrs(range: ReturnType<typeof inlineRanges>[number], active: boolean): Record<string, string> {
  if (range.kind === 'mark') return { class: `md-mark${active ? ' md-mark--shown' : ''}` };
  if (range.kind === 'colour') return { class: `md-colour md-c-${range.tone}` };
  if (range.kind === 'font') return { class: `md-font-${range.value}` };
  if (range.kind === 'size') return { class: 'md-size', style: `font-size:${range.value}px` };
  return { class: `md-${range.kind}`, ...(range.href ? { 'data-href': range.href } : {}) };
}

export const liveKey = new PluginKey('avenDecorations');

/** Formatting, list numbers, placeholders, other people's carets and who is where: all drawn over the text without changing it. */
/** Nodes are immutable and shared between document versions, so what was parsed for one is reused until that block's text changes. */
const parsed = new WeakMap<object, ReturnType<typeof inlineRanges>>();
function rangesOf(node: { textContent: string }) { let found = parsed.get(node); if (!found) { found = inlineRanges(node.textContent); parsed.set(node, found); } return found; }

export const Decorations = Extension.create<{ live: () => LiveState }>({
  name: 'avenDecorations',
  // A function, because Tiptap copies plain-object options and the editor has to keep updating the one object it hands over.
  addOptions() { const state = emptyLive(); return { live: () => state }; },
  addProseMirrorPlugins() {
    const getLive = this.options.live;
    return [new Plugin({
      key: liveKey,
      props: {
        decorations(state) {
          const out: Decoration[] = []; const counters: number[] = [];
          const live = getLive();
          const here = selectionInBlock(state);
          const listed: { id: string; type: never; indent: number; tab: number }[] = [];
          state.doc.forEach((node, _offset, index) => { if (index > 0) listed.push({ id: String(node.attrs.blockId), type: node.attrs.type as never, indent: (node.attrs.indent as number) ?? 0, tab: (node.attrs.tab as number) ?? 0 }); });
          const hidden = live.folded.size || Object.keys(live.tabs).length || listed.some((entry) => (entry.type as string) === 'TABS') ? hiddenIds(listed, live.folded, live.tabs) : new Set<string>();
          state.doc.forEach((node, offset, index) => {
            if (index === 0) { if (node.content.size === 0) out.push(Decoration.node(offset, offset + node.nodeSize, { class: 'is-empty', 'data-placeholder': live.placeholders.TITLE ?? '' })); return; }
            const type = String(node.attrs.blockId ? node.attrs.type : '');
            const id = String(node.attrs.blockId);
            if (hidden.has(id)) out.push(Decoration.node(offset, offset + node.nodeSize, { class: 'is-folded' }));
            if (live.picked.has(id)) out.push(Decoration.node(offset, offset + node.nodeSize, { class: 'is-picked' }));
            const attrs: Record<string, string> = {}; let cls = '';
            if (node.type.name === 'textBlock') {
              if (type === 'NUMBERED') { const level = (node.attrs.indent as number) ?? 0; counters.length = level + 1; counters[level] = (counters[level] ?? 0) + 1; attrs['data-num'] = String(counters[level]); } else counters.length = 0;
              if (node.content.size === 0 && here?.id === id) { cls += ' is-empty'; attrs['data-placeholder'] = live.placeholders[type] ?? ''; }
              const other = live.others[id]; if (other) { cls += ' has-others'; attrs.style = `--presence:${other.colour}`; attrs['data-others'] = other.name; }
              if (cls || Object.keys(attrs).length) out.push(Decoration.node(offset, offset + node.nodeSize, { ...attrs, ...(cls ? { class: cls.trim() } : {}) }));
            } else counters.length = 0;
            if ((node.type.name === 'textBlock' || node.type.name === 'toggleBlock' || node.type.name === 'syncedBlock') && !noMarks.has(type)) {
              const active = here?.id === id;
              for (const range of rangesOf(node)) out.push(Decoration.inline(offset + 1 + range.start, offset + 1 + range.end, inlineAttrs(range, active)));
            }
            for (const comment of live.comments) {
              if (comment.blockId !== id || !comment.quote) continue;
              const spot = findQuote(node.textContent, comment.quote); // the words, wherever they are now: edits before them move them, and a rewritten quote simply stops being marked
              if (spot) out.push(Decoration.inline(offset + 1 + spot.start, offset + 1 + spot.end, { class: 'md-commented', 'data-comment': comment.id }));
            }
            for (const cursor of live.cursors[id] ?? []) {
              const at = offset + 1 + Math.min(cursor.end, node.content.size);
              out.push(Decoration.widget(at, () => { const caret = document.createElement('span'); caret.className = 'aven-caret'; caret.style.background = cursor.colour; const label = document.createElement('span'); label.className = 'aven-caret__name'; label.textContent = cursor.name; label.style.background = cursor.colour; caret.appendChild(label); return caret; }, { key: `caret-${cursor.userId}-${at}`, side: 1 }));
            }
          });
          if (live.find?.query) findMatches(state.doc, live.find.query).forEach((range, at) => out.push(Decoration.inline(range.from, range.to, { class: at === live.find?.current ? 'aven-find aven-find--current' : 'aven-find' })));
          return DecorationSet.create(state.doc, out);
        },
      },
    })];
  },
});

export const baseExtensions = [Doc, Text, Title, TextBlock, ToggleBlock, SourceBlock, SyncedBlock, AtomBlock, UniqueBlockIds];
