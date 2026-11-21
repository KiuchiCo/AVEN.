import assert from 'node:assert/strict';
import test from 'node:test';
import { depthOf, duplicateTitle, folderPath, subtreeHeight, wouldCycle } from '../dist/productivity/document-library-rules.js';

const tree = [{ id: 'a', parentId: null }, { id: 'b', parentId: 'a' }, { id: 'c', parentId: 'b' }, { id: 'd', parentId: null }];

test('folder paths run from the top level down, and survive a loop in the data', () => {
  assert.deepEqual(folderPath(tree, 'c').map((f) => f.id), ['a', 'b', 'c']);
  assert.deepEqual(folderPath(tree, null), []);
  assert.deepEqual(folderPath([{ id: 'x', parentId: 'y' }, { id: 'y', parentId: 'x' }], 'x').map((f) => f.id), ['y', 'x']);
});

test('a folder cannot move into itself or its own subfolders', () => {
  assert.equal(wouldCycle(tree, 'a', 'c'), true); assert.equal(wouldCycle(tree, 'a', 'a'), true);
  assert.equal(wouldCycle(tree, 'c', 'd'), false); assert.equal(wouldCycle(tree, 'a', null), false);
});

test('depth and subtree height add up for the nesting limit', () => {
  assert.equal(depthOf(tree, 'c'), 3); assert.equal(depthOf(tree, null), 0);
  assert.equal(subtreeHeight(tree, 'a'), 3); assert.equal(subtreeHeight(tree, 'd'), 1);
});

test('duplicate titles stay inside the 200 character limit', () => {
  assert.equal(duplicateTitle('Plan'), 'Plan copy'); assert.ok(duplicateTitle('x'.repeat(200)).length <= 200);
});
