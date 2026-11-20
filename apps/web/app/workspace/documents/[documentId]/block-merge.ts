export type MergeableBlock = { id: string; [key: string]: unknown };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Three-way merge of a document's blocks by block id. `base` is what the editor last loaded or saved, `mine` is
 * what is on screen, `theirs` is what someone else saved since.
 *
 * - A block only one side changed takes that side's version; blocks added or removed by one side stay added or removed.
 * - If both sides changed the same block differently (or one edited what the other deleted) the block is a conflict:
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
      else { chosen.set(id, mm); conflicts.push(id); }
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
