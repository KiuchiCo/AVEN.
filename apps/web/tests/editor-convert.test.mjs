import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blocksToDoc, docToBlocks, nodeNameFor } from '../app/workspace/documents/[documentId]/editor-convert.ts';
import { blockTypeList, normalizeBlock } from '../app/workspace/documents/[documentId]/editor-model.ts';

const sample = [
  { id: 'a', type: 'HEADING_1', text: 'Plan', checked: false }, { id: 'b', type: 'PARAGRAPH', text: 'Some **bold** words', checked: false },
  { id: 'c', type: 'BULLET', text: 'one', checked: false }, { id: 'd', type: 'BULLET', text: 'nested', checked: false, indent: 1 }, { id: 'e', type: 'TODO', text: 'ship', checked: true },
  { id: 'f', type: 'TOGGLE', text: 'More', checked: false, level: 2, body: 'hidden' }, { id: 'g', type: 'EQUATION', text: 'x^2', checked: false }, { id: 'h', type: 'SYNCED', text: 'footer', checked: false, syncId: 'sync-1' },
  { id: 'i', type: 'TABLE', text: '', checked: false, rows: [['a', 'b'], ['c', 'd']] }, { id: 'j', type: 'IMAGE', text: 'Caption', checked: false, fileId: 'file-1' },
  { id: 'k', type: 'DATABASE', text: '', checked: false, databaseId: 'db-1', view: 'DONUT' }, { id: 'l', type: 'TABS', text: '', checked: false, tabs: [{ title: 'A', body: 'x' }] },
  { id: 'm', type: 'MEETING', text: 'Standup', checked: false, body: 'notes', date: '2026-11-21', attendees: 'Ana', actions: 'Do it' }, { id: 'n', type: 'PAGE_LINK', text: '', checked: false, docId: 'doc-1' },
  { id: 'o', type: 'DIVIDER', text: '', checked: false }, { id: 'p', type: 'PARAGRAPH', text: '', checked: false },
];

test('blocks survive a trip into the editor document and back unchanged', () => {
  const doc = blocksToDoc('My title', sample);
  assert.equal(doc.content[0].type, 'title');
  const back = docToBlocks(JSON.parse(JSON.stringify(doc)));
  assert.equal(back.title, 'My title');
  assert.deepEqual(back.blocks, sample.map(normalizeBlock));
  assert.equal(JSON.stringify(back.blocks), JSON.stringify(sample.map(normalizeBlock)), 'same keys in the same order, so merges compare equal');
});

test('every block type has an editor node, and text blocks keep their text as the node content', () => {
  for (const type of blockTypeList) assert.ok(['textBlock', 'toggleBlock', 'sourceBlock', 'syncedBlock', 'atomBlock'].includes(nodeNameFor(type)), type);
  const doc = blocksToDoc('', [{ id: 'a', type: 'PARAGRAPH', text: 'hello', checked: false }, { id: 'b', type: 'PARAGRAPH', text: '', checked: false }]);
  assert.deepEqual(doc.content[1].content, [{ type: 'text', text: 'hello' }]);
  assert.equal(doc.content[2].content, undefined, 'an empty block has no text node');
  assert.equal(doc.content[0].content, undefined, 'an empty title has no text node');
});

test('an empty document still has one block to type into', () => {
  assert.equal(blocksToDoc('Untitled', []).content.length, 2);
});
