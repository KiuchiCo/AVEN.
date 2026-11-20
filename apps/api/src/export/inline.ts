/**
 * Inline formatting inside a block's text, as the editor stores it: **bold**, *italic*, ~~strike~~, ++underline++, ==highlight==,
 * `code`, [label](https://…) and {red:colour} / {bg-red:highlight colour}. This is the same grammar the editor understands
 * (apps/web editor-model.ts), kept in step by tests that run the same cases. Nothing here is ever treated as HTML.
 */
export type Run = { text: string; bold?: boolean; italic?: boolean; strike?: boolean; underline?: boolean; code?: boolean; highlight?: string; colour?: string; href?: string };

export const toneColours: Record<string, string> = { brown: '8A6A45', red: 'C0392B', orange: 'A45A08', green: '3F7F3A', blue: '3B6FC4', purple: '8A4FC4', gray: '7B7468' };
export const toneHighlights: Record<string, string> = { brown: 'E2D7C9', red: 'F4D6D2', orange: 'F9E2C4', green: 'D9EBD6', blue: 'D6E2F5', purple: 'E6D9F4', gray: 'E4E1DC' };
const tones = Object.keys(toneColours).join('|');
const colourPattern = new RegExp(`^\\{((?:bg-)?(?:${tones})):([^{}\\n]+?)\\}`);
const isEdge = (text: string, at: number) => at === 0 || !/[\p{L}\p{N}+=]/u.test(text[at - 1]);

export function safeHref(url: string): string | null {
  const value = url.trim();
  if (/^(https?:\/\/|mailto:)[^\s<>"']+$/i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}(\/[^\s<>"']*)?$/i.test(value)) return `https://${value}`;
  return null;
}

export function parseRuns(text: string): Run[] {
  const out: Run[] = []; let plain = ''; let i = 0;
  const flush = () => { if (plain) { out.push({ text: plain }); plain = ''; } };
  while (i < text.length) {
    const rest = text.slice(i); let m: RegExpExecArray | null;
    if ((m = /^`([^`\n]+)`/.exec(rest))) { flush(); out.push({ text: m[1], code: true }); i += m[0].length; continue; }
    if ((m = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest))) { const href = safeHref(m[2]); if (href) { flush(); out.push({ text: m[1], href }); i += m[0].length; continue; } }
    if ((m = /^\*\*([^*\n]+?)\*\*/.exec(rest))) { flush(); out.push({ text: m[1], bold: true }); i += m[0].length; continue; }
    if ((m = /^~~([^~\n]+?)~~/.exec(rest))) { flush(); out.push({ text: m[1], strike: true }); i += m[0].length; continue; }
    if (isEdge(text, i) && (m = /^\+\+(\S(?:[^+\n]*?\S)?)\+\+/.exec(rest))) { flush(); out.push({ text: m[1], underline: true }); i += m[0].length; continue; }
    if (isEdge(text, i) && (m = /^==(\S(?:[^=\n]*?\S)?)==/.exec(rest))) { flush(); out.push({ text: m[1], highlight: 'E0B45A' }); i += m[0].length; continue; }
    if ((m = colourPattern.exec(rest))) { flush(); const tone = m[1]; out.push(tone.startsWith('bg-') ? { text: m[2], highlight: toneHighlights[tone.slice(3)] } : { text: m[2], colour: toneColours[tone] }); i += m[0].length; continue; }
    const startsWord = i === 0 || !/[\p{L}\p{N}_]/u.test(text[i - 1]);
    if ((m = /^\*([^*\s][^*\n]*?)\*/.exec(rest)) || (startsWord && (m = /^_([^_\s][^_\n]*?)_(?![\p{L}\p{N}_])/u.exec(rest)))) { flush(); out.push({ text: m[1], italic: true }); i += m[0].length; continue; }
    plain += text[i]; i += 1;
  }
  flush();
  return out;
}

export const plainOf = (text: string) => parseRuns(text).map((run) => run.text).join('');
