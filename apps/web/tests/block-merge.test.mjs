import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeBlocks } from '../app/workspace/documents/[documentId]/block-merge.ts';

const b = (id, text) => ({ id, type: 'PARAGRAPH', text });
const ids = (result) => result.blocks.map((x) => `${x.id}:${x.text}`);

test('edits to different blocks both survive', () => {
  const base = [b('a', 'one'), b('b', 'two'), b('c', 'three')];
  const result = mergeBlocks(base, [b('a', 'ONE'), b('b', 'two'), b('c', 'three')], [b('a', 'one'), b('b', 'two'), b('c', 'THREE')]);
  assert.deepEqual(ids(result), ['a:ONE', 'b:two', 'c:THREE']); assert.deepEqual(result.conflicts, []);
});

test('the same block edited by both keeps mine and reports the conflict; identical edits are not conflicts', () => {
  const base = [b('a', 'one')];
  assert.deepEqual(mergeBlocks(base, [b('a', 'mine')], [b('a', 'theirs')]), { blocks: [b('a', 'mine')], conflicts: ['a'] });
  assert.deepEqual(mergeBlocks(base, [b('a', 'same')], [b('a', 'same')]), { blocks: [b('a', 'same')], conflicts: [] });
});

test('blocks added by either side are kept, in the place they were written', () => {
  const base = [b('a', 'one'), b('b', 'two')];
  const mine = [b('a', 'one'), b('m', 'mine'), b('b', 'two')];
  const theirs = [b('t0', 'first'), b('a', 'one'), b('b', 'two'), b('t1', 'last')];
  assert.deepEqual(ids(mergeBlocks(base, mine, theirs)), ['t0:first', 'a:one', 'm:mine', 'b:two', 't1:last']);
});

test('deleting a block someone left alone deletes it; deleting what they edited is a conflict that keeps their edit', () => {
  const base = [b('a', 'one'), b('b', 'two')];
  assert.deepEqual(ids(mergeBlocks(base, [b('a', 'one')], base)), ['a:one']);
  assert.deepEqual(ids(mergeBlocks(base, base, [b('a', 'one')])), ['a:one']);
  const kept = mergeBlocks(base, [b('a', 'one')], [b('a', 'one'), b('b', 'TWO')]);
  assert.deepEqual(ids(kept), ['a:one', 'b:TWO']); assert.deepEqual(kept.conflicts, ['b']);
  const mineEdited = mergeBlocks(base, [b('a', 'one'), b('b', 'MINE')], [b('a', 'one')]);
  assert.deepEqual(ids(mineEdited), ['a:one', 'b:MINE']); assert.deepEqual(mineEdited.conflicts, ['b']);
});

test('order: my reordering stands unless the other person reordered too', () => {
  const base = [b('a', '1'), b('b', '2'), b('c', '3')];
  assert.deepEqual(ids(mergeBlocks(base, [b('c', '3'), b('a', '1'), b('b', '2')], base)), ['c:3', 'a:1', 'b:2']);
  assert.deepEqual(ids(mergeBlocks(base, [b('c', '3'), b('a', '1'), b('b', '2')], [b('b', '2'), b('a', '1'), b('c', '3')])), ['b:2', 'a:1', 'c:3']);
});

test('structured blocks (tables, images) compare by content, and nothing is lost when nobody changed anything', () => {
  const table = { id: 't', type: 'TABLE', text: '', rows: [['x', 'y']] };
  const base = [b('a', 'one'), table];
  const edited = { ...table, rows: [['x', 'z']] };
  assert.deepEqual(mergeBlocks(base, [b('a', 'ONE'), table], [b('a', 'one'), edited]).blocks, [b('a', 'ONE'), edited]);
  assert.deepEqual(mergeBlocks(base, base, base), { blocks: base, conflicts: [] });
  assert.deepEqual(mergeBlocks([], [], []), { blocks: [], conflicts: [] });
});
