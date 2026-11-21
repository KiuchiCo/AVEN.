/**
 * Inline formatting inside a block's text, as the editor stores it: **bold**, *italic*, ~~strike~~, ++underline++, ==highlight==,
 * `code`, [label](https://…) and style spans {red,bg-blue,font-serif,size-24:words}, all of which nest. This is the same grammar the editor
 * understands (apps/web inline-style.ts), kept in step by tests that run the same cases. Nothing here is ever treated as HTML.
 */
export type Run = { text: string; bold?: boolean; italic?: boolean; strike?: boolean; underline?: boolean; code?: boolean; highlight?: string; colour?: string; href?: string; font?: 'sans' | 'serif' | 'mono'; size?: number };

export const toneColours: Record<string, string> = { brown: '8A6A45', red: 'C0392B', orange: 'A45A08', green: '3F7F3A', blue: '3B6FC4', purple: '8A4FC4', gray: '7B7468' };
export const toneHighlights: Record<string, string> = { brown: 'E2D7C9', red: 'F4D6D2', orange: 'F9E2C4', green: 'D9EBD6', blue: 'D6E2F5', purple: 'E6D9F4', gray: 'E4E1DC' };
const tones = Object.keys(toneColours);
const isEdge = (text: string, at: number) => at === 0 || !/[\p{L}\p{N}+=]/u.test(text[at - 1]);
const MIN_SIZE = 8; const MAX_SIZE = 96;

export function safeHref(url: string): string | null {
  const value = url.trim();
  if (/^(https?:\/\/|mailto:)[^\s<>"']+$/i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}(\/[^\s<>"']*)?$/i.test(value)) return `https://${value}`;
  return null;
}

type Style = Omit<Run, 'text'>;
/** Longest a style span may be, and deepest spans may nest: limits that keep a hostile block from costing seconds or overflowing the stack. Ordinary text is nowhere near them. */
const MAX_SPAN = 5000;
const MAX_NESTING = 40;
function spanTokens(tokens: string): Style | null {
  const out: Style = {};
  for (const token of tokens.split(',')) {
    let m: RegExpExecArray | null;
    if (tones.includes(token)) out.colour = toneColours[token];
    else if (token.startsWith('bg-') && tones.includes(token.slice(3))) out.highlight = toneHighlights[token.slice(3)];
    else if ((m = /^font-(sans|serif|mono)$/.exec(token))) out.font = m[1] as Run['font'];
    else if ((m = /^size-(\d{1,2})$/.exec(token)) && Number(m[1]) >= MIN_SIZE && Number(m[1]) <= MAX_SIZE) out.size = Number(m[1]);
    else return null;
  }
  return out;
}
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

const sameStyle = (a: Style, b: Style) => { const x = Object.keys(a) as (keyof Style)[]; return x.length === Object.keys(b).length && x.every((key) => a[key] === b[key]); };

export function parseRuns(text: string): Run[] {
  const out: Run[] = [];
  const emit = (value: string, style: Style) => { const last = out[out.length - 1]; if (last && sameStyle({ ...last, text: undefined } as unknown as Style, { ...style, text: undefined } as unknown as Style)) last.text += value; else out.push({ text: value, ...style }); };
  let nesting = 0;
  const scan = (from: number, to: number, inherited: Style) => {
    if (nesting >= MAX_NESTING) { emit(text.slice(from, to), inherited); return; }
    nesting += 1;
    try { scanText(from, to, inherited); } finally { nesting -= 1; }
  };
  const scanText = (from: number, to: number, inherited: Style) => {
    let i = from;
    const wrap = (open: number, length: number, add: Style) => { scan(i + open, i + length - open, { ...inherited, ...add }); i += length; };
    while (i < to) {
      const rest = text.slice(i, to); let m: RegExpExecArray | null;
      if ((m = /^`([^`\n]{1,2000})`/.exec(rest))) { emit(m[1], { ...inherited, code: true }); i += m[0].length; continue; }
      if ((m = /^\[([^\]\n]{1,500})\]\(([^)\s]{1,2000})\)/.exec(rest))) { const href = safeHref(m[2]); if (href) { scan(i + 1, i + 1 + m[1].length, { ...inherited, href }); i += m[0].length; continue; } }
      if ((m = /^\*\*\*([^*\n]+?)\*\*\*/.exec(rest))) { wrap(3, m[0].length, { bold: true, italic: true }); continue; }
      if ((m = /^\*\*([^*\n]+?)\*\*/.exec(rest))) { wrap(2, m[0].length, { bold: true }); continue; }
      if ((m = /^~~([^~\n]+?)~~/.exec(rest))) { wrap(2, m[0].length, { strike: true }); continue; }
      if (isEdge(text, i) && (m = /^\+\+(\S(?:[^+\n]*?\S)?)\+\+/.exec(rest))) { wrap(2, m[0].length, { underline: true }); continue; }
      if (isEdge(text, i) && (m = /^==(\S(?:[^=\n]*?\S)?)==/.exec(rest))) { wrap(2, m[0].length, { highlight: 'E0B45A' }); continue; }
      const span = spanAt(text, i, to);
      if (span) { scan(span.open, span.close, { ...inherited, ...span.style }); i = span.close + 1; continue; }
      const startsWord = i === 0 || !/[\p{L}\p{N}_]/u.test(text[i - 1]);
      if ((m = /^\*([^*\s][^*\n]*?)\*/.exec(rest)) || (startsWord && (m = /^_([^_\s][^_\n]*?)_(?![\p{L}\p{N}_])/u.exec(rest)))) { wrap(1, m[0].length, { italic: true }); continue; }
      emit(text[i], inherited); i += 1;
    }
  };
  scan(0, text.length, {});
  return out;
}

export const plainOf = (text: string) => parseRuns(text).map((run) => run.text).join('');
