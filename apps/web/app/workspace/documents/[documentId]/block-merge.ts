export type MergeableBlock = { id: string; [key: string]: unknown };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- Text inside one block -------------------------------------------------------------------------------------------

/** Words, runs of spaces and single symbols, so edits are compared a word at a time. */
const tokenize = (text: string) => text.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];

/** A change to the base: tokens `start`..`end` of the base are replaced by `text` (an insertion has start === end). */
type Hunk = { start: number; end: number; text: string };

/** The edits that turn `base` into `side`, from a longest-common-subsequence diff of their tokens. */
function hunks(base: string[], side: string[]): Hunk[] {
  let head = 0;
  while (head < base.length && head < side.length && base[head] === side[head]) head += 1;
  let tail = 0;
  while (tail < base.length - head && tail < side.length - head && base[base.length - 1 - tail] === side[side.length - 1 - tail]) tail += 1;
  const a = base.slice(head, base.length - tail), b = side.slice(head, side.length - tail);
  if (!a.length && !b.length) return [];
  // shortcut: past ~4 million cells the exact diff is skipped and everything between the first and last change counts as one edit
  if (a.length * b.length > 4_000_000) return [{ start: head, end: base.length - tail, text: b.join('') }];
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) table[i * width + j] = a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
  const out: Hunk[] = [];
  let i = 0, j = 0, open: Hunk | null = null;
  const close = () => { if (open) { out.push(open); open = null; } };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { close(); i += 1; j += 1; continue; }
    open ??= { start: head + i, end: head + i, text: '' };
    if (j < b.length && (i === a.length || table[i * width + j + 1] >= table[(i + 1) * width + j])) { open.text += b[j]; j += 1; }
    else { open.end += 1; i += 1; }
  }
  close();
  return out;
}

const touches = (a: Hunk, b: Hunk) => (a.start < b.end && b.start < a.end) || (a.start === a.end && b.start === b.end && a.start === b.start);

/**
 * Three-way merge of the text of one block. Edits to different words (or different places) both survive; if both sides edited
 * the same stretch differently it returns null and the caller reports a conflict.
 */
export function mergeText(base: string, mine: string, theirs: string): string | null {
  if (mine === theirs) return mine;
  if (mine === base) return theirs;
  if (theirs === base) return mine;
  const tokens = tokenize(base);
  const mineHunks = hunks(tokens, tokenize(mine)), theirHunks = hunks(tokens, tokenize(theirs));
  const chosen: Hunk[] = [];
  let i = 0, j = 0;
  while (i < mineHunks.length || j < theirHunks.length) {
    const a = mineHunks[i], b = theirHunks[j];
    if (a && b && touches(a, b)) {
      if (a.start !== b.start || a.end !== b.end || a.text !== b.text) return null;
      chosen.push(a); i += 1; j += 1;
    } else if (!b || (a && (a.start < b.start || (a.start === b.start && a.end <= b.end)))) { chosen.push(a); i += 1; }
    else { chosen.push(b); j += 1; }
  }
  let merged = '', at = 0;
  for (const hunk of chosen) { merged += tokens.slice(at, hunk.start).join('') + hunk.text; at = hunk.end; }
  return merged + tokens.slice(at).join('');
}

/** Where a cursor at `index` in `before` sits in `after`, so it stays put in the words around it when someone else edits. */
export function moveCaret(before: string, after: string, index: number): number {
  if (before === after) return index;
  const a = tokenize(before);
  const size = (to: number) => a.slice(0, to).reduce((sum, token) => sum + token.length, 0);
  let shift = 0;
  for (const hunk of hunks(a, tokenize(after))) {
    const start = size(hunk.start), end = size(hunk.end);
    if (index <= start) break;
    if (index < end) return start + shift + hunk.text.length;
    shift += hunk.text.length - (end - start);
  }
  return Math.max(0, Math.min(after.length, index + shift));
}

/**
 * Both sides changed the same block. Property by property: a property only one side changed takes that side's value, and the
 * text of both is merged word by word. Anything both changed differently (or text edited in overlapping places) is a conflict.
 */
function mergeBlock<T extends MergeableBlock>(base: T, mine: T, theirs: T): T | null {
  const merged: MergeableBlock = { ...mine };
  for (const key of new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])) {
    const [b, m, t] = [base[key], mine[key], theirs[key]];
    if (same(m, t)) continue;
    if (same(b, m)) { if (key in theirs) merged[key] = t; else delete merged[key]; continue; }
    if (same(b, t)) continue;
    if (key === 'text' && typeof b === 'string' && typeof m === 'string' && typeof t === 'string') {
      const text = mergeText(b, m, t);
      if (text === null) return null;
      merged[key] = text;
      continue;
    }
    return null;
  }
  return merged as T;
}

/**
 * Three-way merge of a document's blocks by block id. `base` is what the editor last loaded or saved, `mine` is
 * what is on screen, `theirs` is what someone else saved since.
 *
 * - A block only one side changed takes that side's version; blocks added or removed by one side stay added or removed.
 * - If both sides changed the same block, the changes merge property by property and word by word (see `mergeBlock`); only
 *   overlapping edits of the same words are a conflict. A block one side edited and the other deleted is also a conflict:
 *   `mine` is kept (or `theirs` when I deleted what they edited) and its id is listed in `conflicts`.
 * - Order follows my order when the other person didn't reorder, otherwise theirs. New blocks go after the block that
 *   preceded them where they were written. Moving a block while someone else reorders is the one thing that can be lost.
 */
export function mergeBlocks<T extends MergeableBlock>(base: T[], mine: T[], theirs: T[]): { blocks: T[]; conflicts: string[] } {
  const byId = (list: T[]) => new Map(list.map((block) => [block.id, block]));
  const b = byId(base), m = byId(mine), t = byId(theirs);
  const chosen = new Map<string, T>(); const conflicts: string[] = [];
  for (const id of new Set([...base, ...mine, ...theirs].map((block) => block.id))) {
    const [bb, mm, tt] = [b.get(id), m.get(id), t.get(id)];
    if (mm && tt) {
      if (same(mm, tt)) chosen.set(id, mm);
      else if (bb && same(bb, mm)) chosen.set(id, tt);
      else if (bb && same(bb, tt)) chosen.set(id, mm);
      else { const both = bb ? mergeBlock(bb, mm, tt) : null; if (both) chosen.set(id, both); else { chosen.set(id, mm); conflicts.push(id); } }
    } else if (mm) {
      if (!bb) chosen.set(id, mm);
      else if (!same(bb, mm)) { chosen.set(id, mm); conflicts.push(id); }
    } else if (tt) {
      if (!bb) chosen.set(id, tt);
      else if (!same(bb, tt)) { chosen.set(id, tt); conflicts.push(id); }
    }
  }
  const baseOrder = base.map((block) => block.id).filter((id) => t.has(id));
  const theirOrder = theirs.map((block) => block.id).filter((id) => b.has(id));
  const theirsReordered = !same(baseOrder, theirOrder);
  const spine = (theirsReordered ? theirs : mine).map((block) => block.id).filter((id) => chosen.has(id));
  const out = [...spine];
  for (const source of theirsReordered ? [mine, theirs] : [theirs, mine]) {
    const ids = source.map((block) => block.id);
    ids.forEach((id, index) => {
      if (!chosen.has(id) || out.includes(id)) return;
      let at = 0;
      for (let i = index - 1; i >= 0; i -= 1) { const found = out.indexOf(ids[i]); if (found >= 0) { at = found + 1; break; } }
      out.splice(at, 0, id);
    });
  }
  return { blocks: out.map((id) => chosen.get(id)!), conflicts };
}

/**
 * Brings changes that were never saved (kept on this device) back onto the latest saved copy.
 * `base` is the saved copy the draft was started from. Same rules as `mergeBlocks`; a changed title counts as mine unless
 * someone else also renamed the document, which is reported as a conflict.
 */
export function reconcileDraft<T extends MergeableBlock>(
  draft: { title: string; blocks: T[]; base: { updatedAt: string; title: string; blocks: T[] } },
  latest: { updatedAt: string; title: string; blocks: T[] },
): { title: string; blocks: T[]; conflict: boolean } {
  const renamed = draft.title !== draft.base.title;
  if (latest.updatedAt === draft.base.updatedAt) return { title: draft.title, blocks: draft.blocks, conflict: false };
  const { blocks, conflicts } = mergeBlocks(draft.base.blocks, draft.blocks, latest.blocks);
  const titleClash = renamed && latest.title !== draft.base.title && latest.title !== draft.title;
  return { title: renamed ? draft.title : latest.title, blocks, conflict: conflicts.length > 0 || titleClash };
}
