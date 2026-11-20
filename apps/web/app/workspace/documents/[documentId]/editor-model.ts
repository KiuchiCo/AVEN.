// The editing rules of the document editor, kept free of React so they can be tested on their own.
// Documents are still stored as `aven-doc-v1` JSON (a list of blocks), so every existing document opens unchanged.
// Inline formatting is stored inside a block's text as Markdown-style marks (**bold**, *italic*, `code`, ~~strike~~, [label](url)),
// which keeps the live text engine, version history, search and exports working on plain strings.

import { blockCatalog, type CatalogEntry } from './block-catalog.ts';

export type BlockType = 'PARAGRAPH' | 'HEADING_1' | 'HEADING_2' | 'HEADING_3' | 'HEADING_4' | 'BULLET' | 'NUMBERED' | 'TODO' | 'QUOTE' | 'CODE' | 'CALLOUT' | 'TOGGLE'
  | 'DIVIDER' | 'TABLE' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'BOOKMARK' | 'PAGE_LINK' | 'DATABASE' | 'DATABASE_LINK' | 'TOC' | 'BREADCRUMB' | 'BUTTON'
  | 'EQUATION' | 'MERMAID' | 'TABS' | 'SYNCED' | 'MEETING';
export type DatabaseView = 'TABLE' | 'BOARD' | 'GALLERY' | 'LIST' | 'BAR_V' | 'BAR_H' | 'DONUT' | 'NUMBER' | 'CALENDAR' | 'TIMELINE' | 'FEED' | 'DASHBOARD' | 'LINE';
export type TabPane = { title: string; body: string };
/** `text` is the block's main text (a caption for media, the title of a toggle, the label of a button). Other fields belong to specific block types. */
export type Block = {
  id: string; type: BlockType; text: string; checked?: boolean;
  rows?: string[][]; fileId?: string;           // table, image / video / audio / file
  level?: number; body?: string;                // toggle: 0 = plain toggle, 1-3 = toggle heading; body is the folded content
  url?: string;                                 // bookmark
  docId?: string;                               // link to another document
  databaseId?: string; view?: DatabaseView;     // database views and charts
  create?: boolean; linked?: boolean;           // set on a fresh block that still needs its target created or chosen
  tabs?: TabPane[];                             // tabs block
  syncId?: string;                              // synced block: every block with the same id shows the same text
  date?: string; attendees?: string; actions?: string; // meeting notes (text = title, body = notes, fileId = recording)
};
export type Focus = { id: string; caret: number };
export type EditResult = { blocks: Block[]; focus: Focus };

export const blockTypeList: BlockType[] = [...new Set(blockCatalog.map((entry) => entry.type))];
const textual = new Set<BlockType>(['PARAGRAPH', 'HEADING_1', 'HEADING_2', 'HEADING_3', 'HEADING_4', 'BULLET', 'NUMBERED', 'TODO', 'QUOTE', 'CODE', 'CALLOUT', 'TOGGLE', 'EQUATION', 'MERMAID', 'SYNCED']);
const listLike = new Set<BlockType>(['BULLET', 'NUMBERED', 'TODO']);
export const isTextBlock = (type: BlockType) => textual.has(type);
/** Blocks whose text is edited as a shared live session. Synced copies and non-text blocks are saved with the whole document instead. */
export const isLiveText = (type: BlockType) => textual.has(type) && type !== 'SYNCED';
/** Blocks where Enter adds a line inside the block (source text) instead of starting a new block. */
export const keepsNewlines = (type: BlockType) => type === 'CODE' || type === 'CALLOUT' || type === 'EQUATION' || type === 'MERMAID' || type === 'SYNCED';
export const blankBlock = (id: string, type: BlockType = 'PARAGRAPH', patch: Partial<Block> = {}): Block => ({ id, type, text: type === 'BUTTON' ? 'Create task' : '', checked: false, ...(type === 'TABLE' ? { rows: [['', ''], ['', '']] } : {}), ...(type === 'TOGGLE' ? { level: 0, body: '' } : {}), ...(type === 'DATABASE' ? { view: 'TABLE' as DatabaseView } : {}), ...(type === 'TABS' ? { tabs: [{ title: 'Tab 1', body: '' }, { title: 'Tab 2', body: '' }] } : {}), ...(type === 'SYNCED' ? { syncId: patch.syncId ?? id } : {}), ...(type === 'MEETING' ? { date: new Date().toISOString().slice(0, 10), attendees: '', actions: '', body: '' } : {}), ...patch });

// ---- Slash menu ------------------------------------------------------------------------------------------------------

export type SlashItem = CatalogEntry;
export const slashItems: SlashItem[] = blockCatalog;

/** The slash command being typed at the caret: a "/" at the start of a block or after a space, followed by the query. */
export function findSlash(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(before);
  if (!match) return null;
  return { start: caret - match[1].length - 1, query: match[1].toLocaleLowerCase() };
}

/** Block types matching what was typed, best matches first. `label` is the visible (translated) name of each type. */
export function filterSlash(query: string, label: (item: SlashItem) => string): SlashItem[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return slashItems;
  const score = (item: SlashItem) => {
    const name = label(item).toLocaleLowerCase();
    if (name.startsWith(q)) return 0;
    if (item.keywords.some((word) => word.startsWith(q))) return 1;
    if (name.includes(q) || item.keywords.some((word) => word.includes(q))) return 2;
    return 3;
  };
  return slashItems.map((item) => ({ item, rank: score(item) })).filter((entry) => entry.rank < 3).sort((a, b) => a.rank - b.rank).map((entry) => entry.item);
}

// ---- Markdown shortcuts ----------------------------------------------------------------------------------------------

/** Typing "# ", "- ", "1. ", "[] ", "> " or "``` " at the start of a paragraph turns it into that block. Returns null if nothing applies. */
export function markdownShortcut(block: Block, text: string): Partial<Block> | null {
  if (block.type !== 'PARAGRAPH') return null;
  const rules: [RegExp, Partial<Block>][] = [
    [/^# $/, { type: 'HEADING_1' }], [/^## $/, { type: 'HEADING_2' }], [/^### $/, { type: 'HEADING_3' }], [/^#### $/, { type: 'HEADING_4' }],
    [/^[-*+] $/, { type: 'BULLET' }], [/^\d+[.)] $/, { type: 'NUMBERED' }],
    [/^\[ ?\] $/, { type: 'TODO', checked: false }], [/^\[[xX]\] $/, { type: 'TODO', checked: true }],
    [/^> $/, { type: 'QUOTE' }], [/^```\w* ?$/, { type: 'CODE' }], [/^!> $/, { type: 'CALLOUT' }],
  ];
  for (const [pattern, change] of rules) if (pattern.test(text)) return { ...change, text: '' };
  return null;
}

/** "---" or "***" on its own followed by Enter becomes a divider. */
export const isDividerShortcut = (text: string) => /^(-{3,}|\*{3,}|_{3,})$/.test(text);

/** Turns a block into another kind from the catalogue, keeping its text. Fields that belong to the new kind start empty. */
export function convertBlock(block: Block, entry: Pick<CatalogEntry, 'type' | 'patch'>): Block {
  const base = blankBlock(block.id, entry.type, entry.patch);
  const keepsText = block.text.length > 0 && entry.type !== 'DIVIDER' && entry.type !== 'TABLE' && entry.type !== 'TOC' && entry.type !== 'BREADCRUMB';
  return { ...base, text: keepsText ? block.text : base.text, checked: entry.type === 'TODO' ? Boolean(block.checked) : false };
}

/** 1-4 for headings and toggle headings, 0 for everything else. Used by the outline and the table of contents. */
export function headingLevel(block: Pick<Block, 'type' | 'level'>): number {
  if (block.type === 'HEADING_1') return 1; if (block.type === 'HEADING_2') return 2; if (block.type === 'HEADING_3') return 3; if (block.type === 'HEADING_4') return 4;
  return block.type === 'TOGGLE' && block.level ? block.level : 0;
}

// ---- Splitting, merging, moving --------------------------------------------------------------------------------------

const indexOf = (blocks: Block[], id: string) => blocks.findIndex((block) => block.id === id);

/**
 * Enter. Splits the block at the caret and carries on in the next block: lists, to-dos continue as the same kind, headings and
 * quotes fall back to a paragraph, and Enter on an empty list item ends the list. Code and callouts keep a newline unless Mod is held.
 */
export function pressEnter(blocks: Block[], id: string, start: number, end: number, newId: () => string, options: { mod?: boolean; shift?: boolean } = {}): EditResult | null {
  const at = indexOf(blocks, id); if (at < 0) return null;
  const block = blocks[at];
  const text = block.text;
  if (!isTextBlock(block.type)) return null;
  if (options.shift && !keepsNewlines(block.type)) return null; // Shift+Enter is a line break inside the block
  if (keepsNewlines(block.type) && !options.mod) return null; // a newline inside the block, handled by the textarea
  if (isDividerShortcut(text) && block.type === 'PARAGRAPH') {
    const divider: Block = { ...blankBlock(block.id, 'DIVIDER') };
    const next = blankBlock(newId());
    return { blocks: [...blocks.slice(0, at), divider, next, ...blocks.slice(at + 1)], focus: { id: next.id, caret: 0 } };
  }
  if (listLike.has(block.type) && text.length === 0) {
    const converted: Block = { ...block, type: 'PARAGRAPH', checked: false };
    return { blocks: [...blocks.slice(0, at), converted, ...blocks.slice(at + 1)], focus: { id: block.id, caret: 0 } };
  }
  const head = text.slice(0, start), tail = text.slice(end);
  const nextType: BlockType = listLike.has(block.type) ? block.type : 'PARAGRAPH';
  const kept: Block = { ...block, text: head };
  const created: Block = { ...blankBlock(newId(), nextType), text: tail };
  return { blocks: [...blocks.slice(0, at), kept, created, ...blocks.slice(at + 1)], focus: { id: created.id, caret: 0 } };
}

/**
 * Backspace at the very start of a block. A styled block first becomes a paragraph; a paragraph joins the block above (keeping
 * the caret where they met); an empty paragraph is simply removed; a divider or media block above is removed instead of merged.
 */
export function pressBackspaceAtStart(blocks: Block[], id: string): EditResult | null {
  const at = indexOf(blocks, id); if (at < 0) return null;
  const block = blocks[at];
  if (!isTextBlock(block.type)) return null;
  if (block.type !== 'PARAGRAPH') {
    return { blocks: blocks.map((item) => (item.id === id ? { ...item, type: 'PARAGRAPH', checked: false, syncId: undefined } : item)), focus: { id, caret: 0 } };
  }
  if (at === 0) return null;
  const previous = blocks[at - 1];
  if (!isTextBlock(previous.type)) {
    if (block.text.length === 0) return { blocks: blocks.filter((item) => item.id !== previous.id), focus: { id, caret: 0 } };
    return null;
  }
  if (block.text.length === 0) return { blocks: blocks.filter((item) => item.id !== id), focus: { id: previous.id, caret: previous.text.length } };
  const joined: Block = { ...previous, text: previous.text + block.text };
  return { blocks: [...blocks.slice(0, at - 1), joined, ...blocks.slice(at + 1)], focus: { id: previous.id, caret: previous.text.length } };
}

/** Delete at the very end of a block joins the next text block into it. */
export function pressDeleteAtEnd(blocks: Block[], id: string): EditResult | null {
  const at = indexOf(blocks, id); if (at < 0 || at === blocks.length - 1) return null;
  const block = blocks[at], following = blocks[at + 1];
  if (!isTextBlock(block.type) || !isTextBlock(following.type)) return null;
  const joined: Block = { ...block, text: block.text + following.text };
  return { blocks: [...blocks.slice(0, at), joined, ...blocks.slice(at + 2)], focus: { id, caret: block.text.length } };
}

export function moveBlockBy(blocks: Block[], id: string, direction: -1 | 1): Block[] {
  const at = indexOf(blocks, id), to = at + direction;
  if (at < 0 || to < 0 || to >= blocks.length) return blocks;
  const next = blocks.slice(); [next[at], next[to]] = [next[to], next[at]]; return next;
}

/** Moves a block so it sits before `beforeId` (or at the end when null). Used by drag and drop. */
export function reorderBlock(blocks: Block[], id: string, beforeId: string | null): Block[] {
  const from = indexOf(blocks, id); if (from < 0 || id === beforeId) return blocks;
  const without = blocks.filter((block) => block.id !== id);
  const to = beforeId === null ? without.length : without.findIndex((block) => block.id === beforeId);
  if (to < 0) return blocks;
  return [...without.slice(0, to), blocks[from], ...without.slice(to)];
}

export function duplicateBlock(blocks: Block[], id: string, newId: () => string): EditResult | null {
  const at = indexOf(blocks, id); if (at < 0) return null;
  const copy: Block = { ...blocks[at], id: newId(), ...(blocks[at].rows ? { rows: blocks[at].rows!.map((row) => row.slice()) } : {}) };
  return { blocks: [...blocks.slice(0, at + 1), copy, ...blocks.slice(at + 1)], focus: { id: copy.id, caret: copy.text.length } };
}

/** Applies a slash choice: removes "/query" from the text. Text blocks are turned into the chosen type; other blocks are inserted after it. */
export function applySlash(blocks: Block[], id: string, slash: { start: number; query: string }, caret: number, entry: Pick<CatalogEntry, 'type' | 'patch'>, newId: () => string): EditResult | null {
  const at = indexOf(blocks, id); if (at < 0) return null;
  const block = blocks[at];
  const text = block.text.slice(0, slash.start) + block.text.slice(caret);
  const rest = text.replace(/\s+$/, '');
  const { type, patch = {} } = entry;
  if (isTextBlock(type) && type !== 'TOGGLE') {
    const changed: Block = { ...block, ...patch, type, text, checked: type === 'TODO' ? Boolean(block.checked) : false, syncId: type === 'SYNCED' ? block.syncId ?? block.id : undefined };
    return { blocks: [...blocks.slice(0, at), changed, ...blocks.slice(at + 1)], focus: { id, caret: slash.start } };
  }
  if (type === 'TOGGLE') {
    // a toggle keeps the text typed so far as its title
    const changed: Block = { ...blankBlock(block.id, 'TOGGLE', patch), text };
    return { blocks: [...blocks.slice(0, at), changed, ...blocks.slice(at + 1)], focus: { id, caret: slash.start } };
  }
  const created = blankBlock(newId(), type, patch);
  const after = blankBlock(newId());
  const head = rest || block.type !== 'PARAGRAPH' ? [...blocks.slice(0, at), ...(rest ? [{ ...block, text: rest }] : [block])] : blocks.slice(0, at);
  return { blocks: [...head, created, after, ...blocks.slice(at + 1)], focus: { id: after.id, caret: 0 } };
}

// ---- Inline formatting -----------------------------------------------------------------------------------------------

export type Mark = 'bold' | 'italic' | 'code' | 'strike';
const markers: Record<Mark, string> = { bold: '**', italic: '*', code: '`', strike: '~~' };

/** Wraps the selection in a mark, or removes it when the selection is already wrapped. Returns the new text and selection. */
export function toggleMark(text: string, start: number, end: number, mark: Mark): { text: string; start: number; end: number } {
  const open = markers[mark];
  const a = Math.min(start, end), b = Math.max(start, end);
  if (a === b) return { text: text.slice(0, a) + open + open + text.slice(b), start: a + open.length, end: a + open.length };
  const selected = text.slice(a, b);
  if (selected.startsWith(open) && selected.endsWith(open) && selected.length >= open.length * 2) {
    const inner = selected.slice(open.length, selected.length - open.length);
    return { text: text.slice(0, a) + inner + text.slice(b), start: a, end: a + inner.length };
  }
  if (text.slice(a - open.length, a) === open && text.slice(b, b + open.length) === open && !(mark === 'italic' && (text[a - 2] === '*' || text[b + 1] === '*'))) {
    return { text: text.slice(0, a - open.length) + selected + text.slice(b + open.length), start: a - open.length, end: b - open.length };
  }
  return { text: text.slice(0, a) + open + selected + open + text.slice(b), start: a + open.length, end: b + open.length };
}

/** Turns the selection into a link. The address is checked: only http, https and mailto are kept. */
export function makeLink(text: string, start: number, end: number, url: string): { text: string; start: number; end: number } | null {
  const href = safeHref(url); if (!href) return null;
  const a = Math.min(start, end), b = Math.max(start, end);
  const label = text.slice(a, b) || href;
  const replacement = `[${label}](${href})`;
  return { text: text.slice(0, a) + replacement + text.slice(b), start: a + 1, end: a + 1 + label.length };
}

export function safeHref(url: string): string | null {
  const value = url.trim();
  if (/^(https?:\/\/|mailto:)[^\s<>"']+$/i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}(\/[^\s<>"']*)?$/i.test(value)) return `https://${value}`;
  return null;
}

export type Inline = { kind: 'text' | 'bold' | 'italic' | 'code' | 'strike' | 'link'; text: string; href?: string };

/** Splits text into plain and formatted runs. Unmatched marks stay as literal characters; nothing is ever treated as HTML. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let plain = '';
  const flush = () => { if (plain) { out.push({ kind: 'text', text: plain }); plain = ''; } };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^`([^`\n]+)`/.exec(rest))) { flush(); out.push({ kind: 'code', text: m[1] }); i += m[0].length; continue; }
    if ((m = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest))) { const href = safeHref(m[2]); if (href) { flush(); out.push({ kind: 'link', text: m[1], href }); i += m[0].length; continue; } }
    if ((m = /^\*\*([^*\n]+?)\*\*/.exec(rest))) { flush(); out.push({ kind: 'bold', text: m[1] }); i += m[0].length; continue; }
    if ((m = /^~~([^~\n]+?)~~/.exec(rest))) { flush(); out.push({ kind: 'strike', text: m[1] }); i += m[0].length; continue; }
    const startsWord = i === 0 || !/[\p{L}\p{N}_]/u.test(text[i - 1]); // snake_case and __dunder__ names are never italics
    if ((m = /^\*([^*\s][^*\n]*?)\*/.exec(rest)) || (startsWord && (m = /^_([^_\s][^_\n]*?)_(?![\p{L}\p{N}_])/u.exec(rest)))) { flush(); out.push({ kind: 'italic', text: m[1] }); i += m[0].length; continue; }
    plain += text[i]; i += 1;
  }
  flush();
  return out;
}

export const hasInlineMarks = (text: string) => parseInline(text).some((run) => run.kind !== 'text');
