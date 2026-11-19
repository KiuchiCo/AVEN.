export type Segment = { text: string } | { mention: { id: string; name: string } };

const token = /@\[([^\]\n]{1,120})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

/** Splits message text into plain text and mentions. Everything else is shown exactly as written. */
export function parseSegments(body: string): Segment[] {
  const out: Segment[] = []; let last = 0;
  for (const match of body.matchAll(token)) {
    if (match.index > last) out.push({ text: body.slice(last, match.index) });
    out.push({ mention: { name: match[1], id: match[2].toLowerCase() } });
    last = match.index + match[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}

export const mentionToken = (name: string, id: string) => `@[${name.replace(/[\]\n]/g, ' ')}](${id}) `;

/** The "@query" being typed just before the caret, if any. */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const match = /(^|\s)@([^\s@\[\]()]{0,30})$/.exec(text.slice(0, caret));
  return match ? { start: caret - match[2].length - 1, query: match[2].toLowerCase() } : null;
}
