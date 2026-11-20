import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applySlash, duplicateBlock, filterSlash, findSlash, hasInlineMarks, makeLink, markdownShortcut, moveBlockBy, parseInline, pressBackspaceAtStart, pressDeleteAtEnd, pressEnter, reorderBlock, safeHref, toggleMark } from '../app/workspace/documents/[documentId]/editor-model.ts';

const b = (id, text, type = 'PARAGRAPH', extra = {}) => ({ id, type, text, checked: false, ...extra });
let counter = 0; const newId = () => `n${++counter}`;
const label = (item) => item.id.replace(/-/g, ' ');

test('findSlash needs a slash at the start or after a space', () => {
  assert.deepEqual(findSlash('/head', 5), { start: 0, query: 'head' });
  assert.deepEqual(findSlash('hello /to', 9), { start: 6, query: 'to' });
  assert.equal(findSlash('a/b', 3), null);
  assert.equal(findSlash('http://x', 8), null);
});

test('filterSlash ranks names first and finds by keyword', () => {
  assert.equal(filterSlash('', label).length, 49);
  assert.equal(filterSlash('h1', label)[0].type, 'HEADING_1');
  assert.equal(filterSlash('toggle heading 2', label)[0].id, 'toggle-heading-2');
  assert.equal(filterSlash('donut', label)[0].id, 'chart-donut');
  assert.equal(filterSlash('task', label)[0].type, 'TODO');
  assert.deepEqual(filterSlash('zzzz', label), []);
});

test('markdown shortcuts only fire on paragraphs and clear the marker', () => {
  assert.deepEqual(markdownShortcut(b('a', ''), '# '), { type: 'HEADING_1', text: '' });
  assert.deepEqual(markdownShortcut(b('a', ''), '- '), { type: 'BULLET', text: '' });
  assert.deepEqual(markdownShortcut(b('a', ''), '1. '), { type: 'NUMBERED', text: '' });
  assert.deepEqual(markdownShortcut(b('a', ''), '[x] '), { type: 'TODO', checked: true, text: '' });
  assert.equal(markdownShortcut(b('a', '', 'HEADING_1'), '- '), null);
  assert.equal(markdownShortcut(b('a', ''), '#hash'), null);
});

test('Enter splits the block and keeps lists going', () => {
  const r = pressEnter([b('a', 'hello world', 'BULLET')], 'a', 5, 5, newId);
  assert.deepEqual(r.blocks.map((x) => `${x.type}:${x.text}`), ['BULLET:hello', 'BULLET: world']);
  assert.deepEqual(r.focus, { id: r.blocks[1].id, caret: 0 });
  const h = pressEnter([b('a', 'Title', 'HEADING_1')], 'a', 5, 5, newId);
  assert.equal(h.blocks[1].type, 'PARAGRAPH');
});

test('Enter on an empty list item ends the list; code keeps its newline', () => {
  const r = pressEnter([b('a', '', 'TODO')], 'a', 0, 0, newId);
  assert.equal(r.blocks.length, 1); assert.equal(r.blocks[0].type, 'PARAGRAPH');
  assert.equal(pressEnter([b('a', 'x', 'CODE')], 'a', 1, 1, newId), null);
  assert.equal(pressEnter([b('a', 'x', 'CODE')], 'a', 1, 1, newId, { mod: true }).blocks.length, 2);
});

test('--- then Enter makes a divider', () => {
  const r = pressEnter([b('a', '---')], 'a', 3, 3, newId);
  assert.deepEqual(r.blocks.map((x) => x.type), ['DIVIDER', 'PARAGRAPH']);
});

test('Backspace at the start un-styles, then merges, then removes', () => {
  const styled = pressBackspaceAtStart([b('a', 'x', 'HEADING_1')], 'a');
  assert.equal(styled.blocks[0].type, 'PARAGRAPH');
  const merged = pressBackspaceAtStart([b('a', 'one'), b('b', 'two')], 'a'.replace('a', 'b'));
  assert.deepEqual(merged.blocks.map((x) => x.text), ['onetwo']); assert.deepEqual(merged.focus, { id: 'a', caret: 3 });
  const empty = pressBackspaceAtStart([b('a', 'one'), b('b', '')], 'b');
  assert.deepEqual(empty.blocks.map((x) => x.id), ['a']); assert.equal(empty.focus.caret, 3);
  const afterDivider = pressBackspaceAtStart([b('d', '', 'DIVIDER'), b('b', '')], 'b');
  assert.deepEqual(afterDivider.blocks.map((x) => x.id), ['b']);
  assert.equal(pressBackspaceAtStart([b('a', 'first')], 'a'), null);
});

test('Delete at the end pulls the next paragraph up', () => {
  const r = pressDeleteAtEnd([b('a', 'one'), b('b', 'two')], 'a');
  assert.deepEqual(r.blocks.map((x) => x.text), ['onetwo']);
  assert.equal(pressDeleteAtEnd([b('a', 'one'), b('t', '', 'TABLE')], 'a'), null);
});

test('moving, reordering and duplicating blocks', () => {
  const list = [b('a', '1'), b('b', '2'), b('c', '3')];
  assert.deepEqual(moveBlockBy(list, 'a', 1).map((x) => x.id), ['b', 'a', 'c']);
  assert.equal(moveBlockBy(list, 'a', -1), list);
  assert.deepEqual(reorderBlock(list, 'c', 'a').map((x) => x.id), ['c', 'a', 'b']);
  assert.deepEqual(reorderBlock(list, 'a', null).map((x) => x.id), ['b', 'c', 'a']);
  const copy = duplicateBlock([b('t', '', 'TABLE', { rows: [['x']] })], 't', newId);
  assert.notEqual(copy.blocks[1].id, 't'); assert.notEqual(copy.blocks[1].rows, copy.blocks[0].rows);
});

test('slash choices transform the block or insert media', () => {
  const heading = applySlash([b('a', '/h1')], 'a', { start: 0, query: 'h1' }, 3, { type: 'HEADING_1' }, newId);
  assert.deepEqual(heading.blocks.map((x) => `${x.type}:${x.text}`), ['HEADING_1:']);
  const divider = applySlash([b('a', '/div')], 'a', { start: 0, query: 'div' }, 4, { type: 'DIVIDER' }, newId);
  assert.deepEqual(divider.blocks.map((x) => x.type), ['DIVIDER', 'PARAGRAPH']);
  const table = applySlash([b('a', 'Intro /table')], 'a', { start: 6, query: 'table' }, 12, { type: 'TABLE' }, newId);
  assert.deepEqual(table.blocks.map((x) => x.type), ['PARAGRAPH', 'TABLE', 'PARAGRAPH']); assert.equal(table.blocks[0].text, 'Intro'); assert.equal(table.blocks[1].rows.length, 2);
});

test('new block types: toggle headings, database views and media get the right fields', () => {
  const toggle = applySlash([b('a', '/tog')], 'a', { start: 0, query: 'tog' }, 4, { type: 'TOGGLE', patch: { level: 2 } }, newId);
  assert.equal(toggle.blocks[0].type, 'TOGGLE'); assert.equal(toggle.blocks[0].level, 2); assert.equal(toggle.blocks[0].body, '');
  const chart = applySlash([b('a', '/donut')], 'a', { start: 0, query: 'donut' }, 6, { type: 'DATABASE', patch: { view: 'DONUT' } }, newId);
  assert.deepEqual(chart.blocks.map((x) => x.type), ['DATABASE', 'PARAGRAPH']); assert.equal(chart.blocks[0].view, 'DONUT');
  const video = applySlash([b('a', '/video')], 'a', { start: 0, query: 'video' }, 6, { type: 'VIDEO' }, newId);
  assert.deepEqual(video.blocks.map((x) => x.type), ['VIDEO', 'PARAGRAPH']);
  assert.deepEqual(markdownShortcut(b('a', ''), '### '), { type: 'HEADING_3', text: '' });
  assert.deepEqual(markdownShortcut(b('a', ''), '#### '), { type: 'HEADING_4', text: '' });
  const enter = pressEnter([b('a', 'Details', 'TOGGLE', { level: 0, body: 'x' })], 'a', 7, 7, newId);
  assert.equal(enter.blocks[1].type, 'PARAGRAPH');
});

test('equation, mermaid and synced blocks behave as source and shared text', () => {
  assert.equal(pressEnter([b('a', 'x^2', 'EQUATION')], 'a', 3, 3, newId), null);
  assert.equal(pressEnter([b('a', 'graph TD', 'MERMAID')], 'a', 8, 8, newId, { mod: true }).blocks.length, 2);
  const synced = applySlash([b('a', '/sync')], 'a', { start: 0, query: 'sync' }, 5, { type: 'SYNCED' }, newId);
  assert.equal(synced.blocks[0].syncId, 'a');
  const copy = duplicateBlock(synced.blocks, 'a', newId);
  assert.equal(copy.blocks[1].syncId, 'a');
  assert.equal(pressBackspaceAtStart([{ ...b('s', '', 'SYNCED'), syncId: 's' }], 's').blocks[0].syncId, undefined);
  const tabs = applySlash([b('a', '/tabs')], 'a', { start: 0, query: 'tabs' }, 5, { type: 'TABS' }, newId);
  assert.equal(tabs.blocks[0].tabs.length, 2);
});

test('toggleMark wraps, unwraps and handles an empty selection', () => {
  assert.deepEqual(toggleMark('say hello now', 4, 9, 'bold'), { text: 'say **hello** now', start: 6, end: 11 });
  assert.equal(toggleMark('say **hello** now', 6, 11, 'bold').text, 'say hello now');
  assert.equal(toggleMark('x', 1, 1, 'code').text, 'x``');
  assert.equal(toggleMark('plain', 0, 5, 'italic').text, '*plain*');
});

test('links are validated', () => {
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref('example.com/a'), 'https://example.com/a');
  assert.equal(makeLink('see docs', 4, 8, 'javascript:x'), null);
  assert.equal(makeLink('see docs', 4, 8, 'https://a.test').text, 'see [docs](https://a.test)');
});

test('parseInline understands marks and leaves everything else as text', () => {
  assert.deepEqual(parseInline('a **b** *c* `d` ~~e~~ [f](https://g.test)').map((x) => x.kind), ['text', 'bold', 'text', 'italic', 'text', 'code', 'text', 'strike', 'text', 'link']);
  assert.deepEqual(parseInline('2 * 3 * 4').map((x) => x.kind), ['text']);
  assert.deepEqual(parseInline('<b>x</b> **open'), [{ kind: 'text', text: '<b>x</b> **open' }]);
  assert.deepEqual(parseInline('[x](javascript:alert(1))').map((x) => x.kind), ['text']);
  assert.deepEqual(parseInline('window.__pwned=1 and snake_case_name'), [{ kind: 'text', text: 'window.__pwned=1 and snake_case_name' }]);
  assert.deepEqual(parseInline('an _emphasised_ word').map((x) => x.kind), ['text', 'italic', 'text']);
  assert.equal(hasInlineMarks('plain'), false); assert.equal(hasInlineMarks('**b**'), true);
});

import { indentBlock, inlineRanges, normalizeBlock } from '../app/workspace/documents/[documentId]/editor-model.ts';

test('normalizeBlock gives every block one canonical shape', () => {
  const messy = { text: 'Hi', type: 'PARAGRAPH', id: 'a', checked: false, indent: 0, body: '', url: undefined, create: false, junk: 1 };
  assert.deepEqual(Object.keys(normalizeBlock(messy)), ['id', 'type', 'text', 'checked']);
  assert.equal(JSON.stringify(normalizeBlock(normalizeBlock(messy))), JSON.stringify(normalizeBlock(messy)));
  assert.deepEqual(Object.keys(normalizeBlock({ id: 'a', type: 'TOGGLE', text: 'T', level: 2, body: 'x', checked: true })), ['id', 'type', 'text', 'checked', 'level', 'body']);
  assert.equal(normalizeBlock({ id: 'a', type: 'TOGGLE', text: 'T', level: 0 }).level, undefined);
});

test('Tab nests a list item under the one above, never deeper than one level below it', () => {
  const list = [b('a', 'one', 'BULLET'), b('b', 'two', 'BULLET'), b('c', 'three', 'BULLET')];
  const once = indentBlock(list, 'b', 1);
  assert.equal(once[1].indent, 1);
  assert.equal(indentBlock(once, 'c', 1)[2].indent, 1, 'the third item can nest to the second item\'s level plus one');
  assert.equal(indentBlock(list, 'a', 1), null, 'the first item cannot nest');
  assert.equal(indentBlock([b('a', 'x'), b('b', 'y')], 'b', 1), null, 'paragraphs do not nest');
  assert.equal(indentBlock(once, 'b', -1)[1].indent, undefined);
});

test('inlineRanges finds styled text and the marker characters around it', () => {
  const ranges = inlineRanges('a **b** c');
  assert.deepEqual(ranges.map((r) => [r.kind, r.start, r.end]), [['mark', 2, 4], ['bold', 4, 5], ['mark', 5, 7]]);
  assert.deepEqual(inlineRanges('plain text'), []);
  assert.deepEqual(inlineRanges('window.__pwned=1'), []);
  const link = inlineRanges('see [docs](https://a.test)')[1];
  assert.equal(link.kind, 'link'); assert.equal(link.href, 'https://a.test');
});

import { lineToBlock, pasteLines } from '../app/workspace/documents/[documentId]/editor-model.ts';

test('pasted lines become the blocks they describe, and the text after the caret follows the last line', () => {
  assert.equal(lineToBlock('- item', newId).type, 'BULLET'); assert.equal(lineToBlock('### Title', newId).type, 'HEADING_3');
  assert.equal(lineToBlock('[x] done', newId).checked, true); assert.equal(lineToBlock('plain', newId).type, 'PARAGRAPH');
  const result = pasteLines([b('a', 'Hello world')], 'a', 6, 6, 'one\n- two\nthree', newId);
  assert.deepEqual(result.blocks.map((x) => `${x.type}:${x.text}`), ['PARAGRAPH:Hello one', 'BULLET:two', 'PARAGRAPH:threeworld']);
  assert.deepEqual(result.focus.caret, 5);
  assert.equal(pasteLines([b('a', 'x')], 'a', 1, 1, 'single line', newId), null);
  assert.equal(pasteLines([b('a', 'x', 'CODE')], 'a', 1, 1, 'a\nb', newId), null);
});
