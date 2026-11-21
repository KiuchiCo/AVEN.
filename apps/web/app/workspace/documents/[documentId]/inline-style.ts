// Inline formatting, as one composable model.
//
// A block's text carries its formatting as Markdown-style marks (**bold**, *italic*, ~~strike~~, ++underline++, ==highlight==, `code`,
// [label](url)) and as a style span: {red,bg-blue,font-serif,size-24:words}. Spans and marks nest, so a word can be bold, red, serif and 24px
// at once. Everything that reads or changes inline formatting goes through the one scanner below, which turns the text into one cell per visible
// character with the full set of styles that character has. A change edits those styles for a selected range and the writer turns the cells
// back into text, so changing one attribute can never drop another.
// The API keeps a copy of this grammar for export (apps/api/src/export/inline.ts); tests run the same cases against both.

export const tones = ['brown', 'red', 'orange', 'green', 'blue', 'purple', 'gray'] as const;
export type Tone = (typeof tones)[number];
export type FontFamily = 'sans' | 'serif' | 'mono';
export const fontNames: FontFamily[] = ['sans', 'serif', 'mono'];
export const MIN_SIZE = 8; export const MAX_SIZE = 96;

/** Everything that can be true of a stretch of text. An absent key means "not set". */
export type Style = { bold?: true; italic?: true; strike?: true; underline?: true; mark?: true; code?: true; href?: string; tone?: string; bg?: string; font?: FontFamily; size?: number };
export type StyleKey = keyof Style;
export type Flag = 'bold' | 'italic' | 'strike' | 'underline' | 'mark' | 'code';

export function safeHref(url: string): string | null {
  const value = url.trim();
  if (/^(https?:\/\/|mailto:)[^\s<>"']+$/i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}(\/[^\s<>"']*)?$/i.test(value)) return `https://${value}`;
  return null;
}

/** Underline and highlight only start at the beginning of a word, so "C++ and C++" or "a==b==c" stay plain text. */
const isEdge = (text: string, at: number) => at === 0 || !/[\p{L}\p{N}+=]/u.test(text[at - 1]);
const isTone = (value: string): value is Tone => (tones as readonly string[]).includes(value);

/** The `{tokens:` that open a style span, with the style they set; null when any token is unknown. */
function spanTokens(tokens: string): Style | null {
  const out: Style = {};
  for (const token of tokens.split(',')) {
    let m: RegExpExecArray | null;
    if (isTone(token)) out.tone = token;
    else if (token.startsWith('bg-') && isTone(token.slice(3))) out.bg = token.slice(3);
    else if ((m = /^font-(sans|serif|mono)$/.exec(token))) out.font = m[1] as FontFamily;
    else if ((m = /^size-(\d{1,2})$/.exec(token)) && Number(m[1]) >= MIN_SIZE && Number(m[1]) <= MAX_SIZE) out.size = Number(m[1]);
    else return null;
  }
  return out;
}

/** Longest a style span may be, and deepest spans may nest: limits that keep a hostile block (one huge unclosed brace, thousands of nested ones) from costing seconds or overflowing the stack. Ordinary text is nowhere near them. */
const MAX_SPAN = 5000;
const MAX_NESTING = 40;

/** A style span at `i`: where its words start and end, and what it sets. Braces inside balance, so spans can hold spans. */
function spanAt(text: string, i: number, end: number): { open: number; close: number; style: Style } | null {
  if (text[i] !== '{') return null;
  const colon = text.indexOf(':', i);
  if (colon < 0 || colon >= end || colon - i > 60) return null;
  const style = /^[a-z0-9-]+(?:,[a-z0-9-]+)*$/.test(text.slice(i + 1, colon)) ? spanTokens(text.slice(i + 1, colon)) : null;
  if (!style) return null;
  let depth = 1;
  for (let at = colon + 1, stop = Math.min(end, colon + 1 + MAX_SPAN); at < stop; at += 1) { // a bounded look: an unclosed `{red:` must not make every later character rescan the whole rest of the text
    const ch = text[at];
    if (ch === '\n') return null;
    if (ch === '{') depth += 1;
    else if (ch === '}' && (depth -= 1) === 0) return at > colon + 1 ? { open: colon + 1, close: at, style } : null;
  }
  return null;
}

export type Sink = { char: (at: number, style: Style) => void; mark: (start: number, end: number) => void; style: (start: number, end: number, kind: StyleKey | 'colour' | 'link', value?: string | number) => void };

/** Reads text[from, to) with `inherited` styles, telling the sink about each visible character, each marker character and each styled range. */
let nesting = 0;
export function scan(text: string, from: number, to: number, inherited: Style, sink: Sink): void {
  if (nesting >= MAX_NESTING) { for (let at = from; at < to; at += 1) sink.char(at, inherited); return; } // too deep to read: shown as it is
  nesting += 1;
  try { scanText(text, from, to, inherited, sink); } finally { nesting -= 1; }
}

function scanText(text: string, from: number, to: number, inherited: Style, sink: Sink): void {
  let i = from;
  const wrap = (open: number, close: number, length: number, add: Style, kinds: StyleKey[]) => {
    sink.mark(i, i + open); sink.mark(i + length - close, i + length);
    for (const kind of kinds) sink.style(i + open, i + length - close, kind);
    scan(text, i + open, i + length - close, { ...inherited, ...add }, sink);
    i += length;
  };
  while (i < to) {
    const rest = text.slice(i, to); let m: RegExpExecArray | null;
    if ((m = /^`([^`\n]{1,2000})`/.exec(rest))) { sink.mark(i, i + 1); sink.mark(i + m[0].length - 1, i + m[0].length); sink.style(i + 1, i + m[0].length - 1, 'code'); for (let at = i + 1; at < i + m[0].length - 1; at += 1) sink.char(at, { ...inherited, code: true }); i += m[0].length; continue; }
    if ((m = /^\[([^\]\n]{1,500})\]\(([^)\s]{1,2000})\)/.exec(rest))) {
      const href = safeHref(m[2]);
      if (href) { const label = m[1].length; sink.mark(i, i + 1); sink.mark(i + 1 + label, i + m[0].length); sink.style(i + 1, i + 1 + label, 'link', href); scan(text, i + 1, i + 1 + label, { ...inherited, href }, sink); i += m[0].length; continue; }
    }
    if ((m = /^\*\*\*([^*\n]+?)\*\*\*/.exec(rest))) { wrap(3, 3, m[0].length, { bold: true, italic: true }, ['bold', 'italic']); continue; }
    if ((m = /^\*\*([^*\n]+?)\*\*/.exec(rest))) { wrap(2, 2, m[0].length, { bold: true }, ['bold']); continue; }
    if ((m = /^~~([^~\n]+?)~~/.exec(rest))) { wrap(2, 2, m[0].length, { strike: true }, ['strike']); continue; }
    if (isEdge(text, i) && (m = /^\+\+(\S(?:[^+\n]*?\S)?)\+\+/.exec(rest))) { wrap(2, 2, m[0].length, { underline: true }, ['underline']); continue; }
    if (isEdge(text, i) && (m = /^==(\S(?:[^=\n]*?\S)?)==/.exec(rest))) { wrap(2, 2, m[0].length, { mark: true }, ['mark']); continue; }
    const span = spanAt(text, i, to);
    if (span) {
      sink.mark(i, span.open); sink.mark(span.close, span.close + 1);
      if (span.style.tone) sink.style(span.open, span.close, 'colour', span.style.tone);
      if (span.style.bg) sink.style(span.open, span.close, 'colour', `bg-${span.style.bg}`);
      if (span.style.font) sink.style(span.open, span.close, 'font', span.style.font);
      if (span.style.size) sink.style(span.open, span.close, 'size', span.style.size);
      scan(text, span.open, span.close, { ...inherited, ...span.style }, sink); i = span.close + 1; continue;
    }
    const startsWord = i === 0 || !/[\p{L}\p{N}_]/u.test(text[i - 1]); // snake_case and __dunder__ names are never italics
    if ((m = /^\*([^*\s][^*\n]*?)\*/.exec(rest)) || (startsWord && (m = /^_([^_\s][^_\n]*?)_(?![\p{L}\p{N}_])/u.exec(rest)))) { wrap(1, 1, m[0].length, { italic: true }, ['italic']); continue; }
    sink.char(i, inherited); i += 1;
  }
}

// ---- Cells: one per visible character --------------------------------------------------------------------------------------------------

export type Cell = { ch: string; style: Style; src: number };
export function cellsOf(text: string): Cell[] {
  const out: Cell[] = [];
  scan(text, 0, text.length, {}, { char: (at, style) => out.push({ ch: text[at], style, src: at }), mark: () => {}, style: () => {} });
  return out;
}

const sameStyle = (a: Style, b: Style) => (Object.keys(a) as StyleKey[]).length === (Object.keys(b) as StyleKey[]).length && (Object.keys(a) as StyleKey[]).every((key) => a[key] === b[key]);
const clean = (style: Style): Style => { const out: Record<string, unknown> = {}; for (const key of Object.keys(style) as StyleKey[]) if (style[key] !== undefined && style[key] !== null) out[key] = style[key]; return out as Style; };

/** The marks and spans that go around one run of words, outermost first: link, span, strike, underline, highlight, bold/italic, code. */
function wrapRun(style: Style, text: string): [string, string] {
  let open = ''; let close = '';
  const add = (before: string, after = before) => { open = before + open; close += after; };
  if (style.code && !text.includes('`')) add('`');
  if (style.bold && style.italic) add('***'); else if (style.bold) add('**'); else if (style.italic) add('*');
  if (style.mark) add('==');
  if (style.underline) add('++');
  if (style.strike) add('~~');
  const tokens = [style.tone, style.bg ? `bg-${style.bg}` : '', style.font ? `font-${style.font}` : '', style.size ? `size-${style.size}` : ''].filter(Boolean);
  if (tokens.length) add(`{${tokens.join(',')}:`, '}');
  if (style.href) add('[', `](${style.href})`);
  return [open, close];
}

/** What a mark that needs a word on each edge (italic, underline, highlight, code) cannot hold: spaces at either end of a run, which move outside it. */
const needsEdge = (style: Style) => style.italic || style.underline || style.mark || style.code;
const plainEdge = (style: Style): Style => { const { italic, underline, mark, code, ...rest } = style; void italic; void underline; void mark; void code; return rest; };

/** Writes cells back as text. `at[i]` is where cell i's character ended up, so a selection can follow its words. */
export function writeCells(cells: Cell[]): { text: string; at: number[] } {
  type Piece = { text: string; style: Style; from: number };
  const pieces: Piece[] = [];
  let i = 0;
  while (i < cells.length) {
    const style = clean(cells[i].style); let j = i;
    if (cells[i].ch === '\n') { pieces.push({ text: '\n', style: {}, from: i }); i += 1; continue; }
    while (j < cells.length && cells[j].ch !== '\n' && sameStyle(clean(cells[j].style), style)) j += 1;
    const chars = cells.slice(i, j).map((cell) => cell.ch).join('');
    if (needsEdge(style)) {
      const lead = /^\s*/.exec(chars)![0].length; const trail = lead === chars.length ? 0 : /\s*$/.exec(chars)![0].length;
      if (lead) pieces.push({ text: chars.slice(0, lead), style: plainEdge(style), from: i });
      if (lead < chars.length) pieces.push({ text: chars.slice(lead, chars.length - trail), style, from: i + lead });
      if (trail) pieces.push({ text: chars.slice(chars.length - trail), style: plainEdge(style), from: j - trail });
    } else pieces.push({ text: chars, style, from: i });
    i = j;
  }
  let text = ''; const at = new Array<number>(cells.length).fill(0);
  for (const piece of pieces) {
    const [open, close] = wrapRun(piece.style, piece.text);
    const base = text.length + open.length;
    for (let k = 0; k < piece.text.length; k += 1) at[piece.from + k] = base + k;
    text += open + piece.text + close;
  }
  return { text, at };
}

// ---- Reading --------------------------------------------------------------------------------------------------------------------------

/** The text as it is read: no marker characters. */
export const visibleText = (text: string) => cellsOf(text).map((cell) => cell.ch).join('');

export type StyledRun = { text: string; style: Style };
/** The text as consecutive runs of the same style; what every renderer draws. */
export function styledRuns(text: string): StyledRun[] {
  const out: StyledRun[] = [];
  for (const cell of cellsOf(text)) {
    const last = out[out.length - 1];
    if (last && sameStyle(last.style, cell.style)) last.text += cell.ch; else out.push({ text: cell.ch, style: cell.style });
  }
  return out;
}

/** Where a source offset falls among the visible characters (marker characters take no room). */
const visibleAt = (cells: Cell[], source: number) => { let n = 0; while (n < cells.length && cells[n].src < source) n += 1; return n; };

/** The visible characters a selection covers, as cell indexes [from, to). */
function cellRange(cells: Cell[], start: number, end: number): [number, number] {
  const a = Math.min(start, end), b = Math.max(start, end);
  return [visibleAt(cells, a), visibleAt(cells, b)];
}

/** What is true of every character in the selection (or, for a caret, of the character before it). Mixed values read as unset. */
export function styleAt(text: string, start: number, end: number): Style {
  const cells = cellsOf(text);
  if (!cells.length) return {};
  let [from, to] = cellRange(cells, start, end);
  if (from === to) { from = Math.max(0, from - 1); to = from + 1; }
  const chosen = cells.slice(from, to); if (!chosen.length) return {};
  const first = clean(chosen[0].style); const out: Record<string, unknown> = {};
  for (const key of Object.keys(first) as StyleKey[]) if (chosen.every((cell) => cell.style[key] === first[key])) out[key] = first[key];
  return out as Style;
}

/** The characters the selection covers carry more than one size or font. */
export function isMixed(text: string, start: number, end: number, key: 'size' | 'font'): boolean {
  const cells = cellsOf(text); const [from, to] = cellRange(cells, start, end);
  const values = new Set(cells.slice(from, to).map((cell) => cell.style[key]));
  return values.size > 1;
}

// ---- Changing -------------------------------------------------------------------------------------------------------------------------

export type Change = { text: string; start: number; end: number };

/** Edits the style of the characters in a selection and writes the text back with the selection kept on the same words. Null when nothing is selected. */
export function restyle(text: string, start: number, end: number, change: (style: Style) => Style): Change | null {
  const cells = cellsOf(text); const [from, to] = cellRange(cells, start, end);
  if (from === to) return null;
  const next = cells.map((cell, index) => (index >= from && index < to ? { ...cell, style: clean(change(cell.style)) } : cell));
  const written = writeCells(next);
  return { text: written.text, start: written.at[from], end: written.at[to - 1] + 1 };
}

/** Turns a mark on for the whole selection, or off when every character already has it. */
export function toggleFlag(text: string, start: number, end: number, flag: Flag): Change | null {
  const cells = cellsOf(text); const [from, to] = cellRange(cells, start, end);
  if (from === to) return null;
  const on = !cells.slice(from, to).every((cell) => cell.style[flag]);
  return restyle(text, start, end, (style) => { const next = { ...style }; if (on) next[flag] = true; else delete next[flag]; return next; });
}

/** Sets (or, with null, removes) the text colour, highlight colour, font family or size of the selection. */
export function setValue(text: string, start: number, end: number, key: 'tone' | 'bg' | 'font' | 'size', value: string | number | null): Change | null {
  return restyle(text, start, end, (style) => { const next: Record<string, unknown> = { ...style }; if (value === null) delete next[key]; else next[key] = value; return next as Style; });
}

/** Removes every kind of formatting from the selection except links; the words and everything outside the selection stay as they are. */
export function clearStyle(text: string, start: number, end: number): Change | null {
  return restyle(text, start, end, (style) => (style.href ? { href: style.href } : {}));
}

/** The first and last character of the word around `at`, as source offsets; null when `at` is not touching a word. */
export function wordAt(text: string, at: number): { start: number; end: number } | null {
  const cells = cellsOf(text); const here = visibleAt(cells, at);
  const word = (index: number) => index >= 0 && index < cells.length && /[\p{L}\p{N}_'’-]/u.test(cells[index].ch);
  let from = here; let to = here;
  if (!word(from) && !word(from - 1)) return null;
  while (word(from - 1)) from -= 1;
  while (word(to)) to += 1;
  return { start: cells[from].src, end: cells[to - 1].src + 1 };
}

/** The same words with every mark and colour removed (a link keeps its label). */
export const plainOf = visibleText;

/** Turns a mark on or off for the whole selection (the caller decides which, so a selection across paragraphs is treated as one). */
export function setFlag(text: string, start: number, end: number, flag: Flag, on: boolean): Change | null {
  return restyle(text, start, end, (style) => { const next = { ...style }; if (on) next[flag] = true; else delete next[flag]; return next; });
}

/** What is true of every style in the list: for a selection that spans several paragraphs. */
export function commonStyle(styles: Style[]): Style {
  if (!styles.length) return {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(styles[0]) as StyleKey[]) if (styles.every((style) => style[key] === styles[0][key])) out[key] = styles[0][key];
  return out as Style;
}

/** The words (without formatting marks) between two source offsets. */
export function visibleSlice(text: string, start: number, end: number): string {
  const a = Math.min(start, end), b = Math.max(start, end);
  return cellsOf(text).filter((cell) => cell.src >= a && cell.src < b).map((cell) => cell.ch).join('');
}
