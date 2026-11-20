// Keeps the editor's document and the block list in step, with the smallest possible change to the editor. Because each block is one
// node carrying its id, remote edits, restored versions and keyboard commands become small transactions: the caret, the undo history and
// everything else in the document stay where they were.
import { NodeSelection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { blockToNode, docToBlocks, hasInlineContent, type DocJSON } from './editor-convert.ts';
import { blankBlock, normalizeBlock, type Block } from './editor-model.ts';

export type Located = { node: PMNode; pos: number; id: string };

/** The block nodes of the document (everything after the title) with where each one starts. */
export function locateBlocks(doc: PMNode): Located[] {
  const out: Located[] = [];
  doc.forEach((node, offset, index) => { if (index > 0) out.push({ node, pos: offset, id: String(node.attrs.blockId) }); });
  return out;
}

export function readDoc(doc: PMNode): { title: string; blocks: Block[] } { return docToBlocks(doc.toJSON() as DocJSON); }

/** Replaces the text of a node by changing only the middle that differs, so a caret before or after the change keeps its place. */
function setNodeText(tr: Transaction, pos: number, node: PMNode, next: string) {
  const old = node.textContent;
  let head = 0; while (head < old.length && head < next.length && old[head] === next[head]) head += 1;
  let tail = 0; while (tail < old.length - head && tail < next.length - head && old[old.length - 1 - tail] === next[next.length - 1 - tail]) tail += 1;
  const insert = next.slice(head, next.length - tail);
  const from = pos + 1 + head, to = pos + 1 + old.length - tail;
  if (from === to && !insert) return;
  tr.replaceWith(from, to, insert ? tr.doc.type.schema.text(insert) : Fragment.empty);
}

/** Makes the document show `target` (and `title`, when given). */
export function reconcile(tr: Transaction, target: Block[], title: string | null): Transaction {
  const schema = tr.doc.type.schema;
  const wanted = target.length ? target : [blankBlock(crypto.randomUUID())];
  const make = (block: Block) => schema.nodeFromJSON(blockToNode(block));
  if (title !== null) { const first = tr.doc.firstChild; if (first && first.textContent !== title) setNodeText(tr, 0, first, title); }
  const current = locateBlocks(tr.doc);
  if (current.length === wanted.length && current.every((entry, index) => entry.id === wanted[index].id)) {
    for (let index = current.length - 1; index >= 0; index -= 1) {
      const { node, pos } = current[index]; const next = make(wanted[index]);
      if (node.eq(next)) continue;
      if (node.type === next.type) {
        if (JSON.stringify(node.attrs) !== JSON.stringify(next.attrs)) tr.setNodeMarkup(pos, undefined, next.attrs);
        if (hasInlineContent(node.type.name) && node.textContent !== next.textContent) setNodeText(tr, pos, node, next.textContent);
      } else tr.replaceWith(pos, pos + node.nodeSize, next);
    }
    return tr;
  }
  let head = 0;
  while (head < current.length && head < wanted.length && current[head].id === wanted[head].id && current[head].node.eq(make(wanted[head]))) head += 1;
  let tail = 0;
  while (tail < current.length - head && tail < wanted.length - head && current[current.length - 1 - tail].id === wanted[wanted.length - 1 - tail].id && current[current.length - 1 - tail].node.eq(make(wanted[wanted.length - 1 - tail]))) tail += 1;
  const from = head < current.length ? current[head].pos : tr.doc.content.size;
  const lastReplaced = current[current.length - 1 - tail];
  const to = tail === current.length - head ? from : lastReplaced.pos + lastReplaced.node.nodeSize;
  const fresh = wanted.slice(head, wanted.length - tail).map(make);
  tr.replaceWith(from, to, Fragment.fromArray(fresh));
  return tr;
}

/** Where the selection is, in the terms the editing rules use: which block, and which characters of its text. Null when it spans blocks. */
export type BlockSelection = { id: string; index: number; pos: number; node: PMNode; start: number; end: number; inline: boolean };
export function selectionInBlock(state: EditorState): BlockSelection | null {
  const { selection } = state;
  if (selection instanceof NodeSelection) {
    const found = locateBlocks(state.doc).find((entry) => entry.pos === selection.from);
    return found ? { id: found.id, index: locateBlocks(state.doc).indexOf(found), pos: found.pos, node: found.node, start: 0, end: 0, inline: false } : null;
  }
  const { $from, $to } = selection;
  if ($from.depth < 1 || !$from.sameParent($to) || $from.parent.type.name === 'title') return null;
  const pos = $from.before(1); const node = $from.node(1);
  const blocks = locateBlocks(state.doc);
  const index = blocks.findIndex((entry) => entry.pos === pos);
  return index < 0 ? null : { id: String(node.attrs.blockId), index, pos, node, start: $from.parentOffset, end: $to.parentOffset, inline: true };
}

/** Puts the caret at `caret` characters into the block (or selects the block if it has no text). */
export function selectBlock(tr: Transaction, id: string, caret: number, end = caret): Transaction {
  const found = locateBlocks(tr.doc).find((entry) => entry.id === id);
  if (!found) return tr;
  if (!hasInlineContent(found.node.type.name)) return tr.setSelection(NodeSelection.create(tr.doc, found.pos));
  const size = found.node.content.size;
  return tr.setSelection(TextSelection.create(tr.doc, found.pos + 1 + Math.min(caret, size), found.pos + 1 + Math.min(end, size)));
}

export const sameBlocks = (a: Block[], b: Block[]) => a.length === b.length && a.every((block, index) => JSON.stringify(normalizeBlock(block)) === JSON.stringify(normalizeBlock(b[index])));
