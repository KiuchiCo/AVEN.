import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSchema } from '@tiptap/core';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { baseExtensions } from '../app/workspace/documents/[documentId]/editor-extensions.ts';
import { blocksToDoc } from '../app/workspace/documents/[documentId]/editor-convert.ts';
import { findMatches, locateBlocks, readDoc, reconcile, sameBlocks, selectBlock, selectionInBlock } from '../app/workspace/documents/[documentId]/editor-sync.ts';
import { normalizeBlock } from '../app/workspace/documents/[documentId]/editor-model.ts';

const schema = getSchema(baseExtensions);
const b = (id, text, type = 'PARAGRAPH', extra = {}) => normalizeBlock({ id, type, text, ...extra });
const stateOf = (title, blocks) => EditorState.create({ schema, doc: schema.nodeFromJSON(blocksToDoc(title, blocks)) });
const apply = (state, target, title = null) => { const tr = reconcile(state.tr, target, title); return { state: state.apply(tr), tr }; };

test('the schema builds a document from blocks and reads them back unchanged', () => {
  const blocks = [b('a', 'Hello **world**'), b('c', 'item', 'BULLET', { indent: 1 }), b('t', '', 'TABLE', { rows: [['x']] }), b('e', 'x^2', 'EQUATION'), b('g', 'More', 'TOGGLE', { level: 1, body: 'inner' })];
  const state = stateOf('Title', blocks);
  const read = readDoc(state.doc);
  assert.equal(read.title, 'Title'); assert.ok(sameBlocks(read.blocks, blocks));
  assert.equal(locateBlocks(state.doc).map((x) => x.id).join(), 'a,c,t,e,g');
});

test('a remote edit inside a block moves a caret that sits after it and leaves a caret before it alone', () => {
  let state = stateOf('T', [b('a', 'hello world')]);
  const at = locateBlocks(state.doc)[0].pos;
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at + 1 + 8))); // after "hello wo"
  ({ state } = apply(state, [b('a', 'oh, hello world')]));
  assert.equal(selectionInBlock(state).start, 8 + 4, 'the caret moved with its word');
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at + 1 + 2)));
  ({ state } = apply(state, [b('a', 'oh, hello world!')]));
  assert.equal(selectionInBlock(state).start, 2, 'text added after the caret does not move it');
});

test('structural changes become minimal replacements and keep unchanged blocks', () => {
  const before = [b('a', 'one'), b('b', 'two'), b('c', 'three')];
  let { state } = apply(stateOf('T', before), [b('a', 'one'), b('n', 'new'), b('b', 'two'), b('c', 'three')]);
  assert.equal(readDoc(state.doc).blocks.map((x) => x.id).join(), 'a,n,b,c');
  ({ state } = apply(state, [b('a', 'one'), b('c', 'three')]));
  assert.equal(readDoc(state.doc).blocks.map((x) => x.text).join(), 'one,three');
  ({ state } = apply(state, [b('c', 'three'), b('a', 'one')]));
  assert.equal(readDoc(state.doc).blocks.map((x) => x.id).join(), 'c,a');
  ({ state } = apply(state, [b('c', 'three', 'HEADING_1'), b('a', 'one')], 'New title'));
  const read = readDoc(state.doc);
  assert.equal(read.title, 'New title'); assert.equal(read.blocks[0].type, 'HEADING_1');
});

test('attribute-only changes (checking a to-do, changing a toggle level) do not touch the text', () => {
  let { state } = apply(stateOf('T', [b('a', 'ship it', 'TODO'), b('g', 'More', 'TOGGLE', { level: 0 })]), [b('a', 'ship it', 'TODO', { checked: true }), b('g', 'More', 'TOGGLE', { level: 2, body: 'x' })]);
  const read = readDoc(state.doc).blocks;
  assert.equal(read[0].checked, true); assert.equal(read[0].text, 'ship it'); assert.equal(read[1].level, 2); assert.equal(read[1].body, 'x');
});

test('an empty target still leaves one block to type into, and selectBlock lands the caret in the right place', () => {
  let { state } = apply(stateOf('T', [b('a', 'x')]), []);
  assert.equal(readDoc(state.doc).blocks.length, 1);
  state = stateOf('T', [b('a', 'hello'), b('t', '', 'TABLE', { rows: [['x']] })]);
  state = state.apply(selectBlock(state.tr, 'a', 3));
  assert.equal(selectionInBlock(state).start, 3);
  state = state.apply(selectBlock(state.tr, 't', 0));
  assert.equal(selectionInBlock(state).inline, false);
});

test('findMatches finds every occurrence in the body, ignores case and the title, and never matches across blocks', () => {
  const state = stateOf('Cat title', [b('a', 'The cat sat. CAT again'), b('c', 'ca'), b('d', 't')]);
  const hits = findMatches(state.doc, 'cat');
  assert.equal(hits.length, 2);
  assert.deepEqual(hits.map((hit) => state.doc.textBetween(hit.from, hit.to)), ['cat', 'CAT']);
  assert.equal(findMatches(state.doc, '').length, 0);
});

test('readDoc hands back the same block object for a block that did not change', () => {
  let state = stateOf('T', [b('a', 'one'), b('c', 'two')]);
  const first = readDoc(state.doc).blocks;
  state = apply(state, [b('a', 'one'), b('c', 'two!')]).state;
  const second = readDoc(state.doc).blocks;
  assert.equal(second[0], first[0]);
  assert.notEqual(second[1], first[1]);
});
