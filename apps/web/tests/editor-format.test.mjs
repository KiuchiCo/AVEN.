import assert from 'node:assert/strict';
import test from 'node:test';
import { activeMarks, activeTones, clearBlockFormatting, clampSize, inlineRanges, isFormattable, normalizeBlock, parseInline, plainFormat, setLayout, stepSize, toggleMark } from '../app/workspace/documents/[documentId]/editor-model.ts';
import { blockToNode, nodeToBlock } from '../app/workspace/documents/[documentId]/editor-convert.ts';

test('the toolbar sees which marks the selection is inside, including a whole formatted word selected with its markers', () => {
  const text = 'a **bold** and *it* ++u++';
  assert.deepEqual([...activeMarks(text, 4, 8)], ['bold']); assert.deepEqual([...activeMarks(text, 0, 1)], []);
  assert.deepEqual([...activeMarks(text, 2, 10)], ['bold'], 'markers included');
  assert.deepEqual([...activeMarks(text, 7, 7)], ['bold'], 'a caret inside the word');
  assert.deepEqual([...activeMarks('***x***', 3, 4)].sort(), ['bold', 'italic']);
  assert.deepEqual([...activeMarks('see [docs](https://a.test)', 6, 9)], ['link']);
});

test('colour and highlight at the selection are read separately', () => {
  assert.deepEqual(activeTones('a {red:warm} b', 7, 11), { colour: 'red', background: null });
  assert.deepEqual(activeTones('a {bg-green:cool} b', 12, 16), { colour: null, background: 'green' });
  assert.deepEqual(activeTones('plain', 0, 3), { colour: null, background: null });
});

test('bold and italic can be combined and taken apart again', () => {
  assert.deepEqual(parseInline('x ***both*** y').map((run) => run.kind), ['text', 'bolditalic', 'text']);
  assert.deepEqual(inlineRanges('***b***').filter((range) => range.kind !== 'mark').map((range) => range.kind), ['bold', 'italic']);
  const bold = toggleMark('word', 0, 4, 'bold'); const both = toggleMark(bold.text, bold.start, bold.end, 'italic');
  assert.equal(both.text, '***word***');
  const noItalic = toggleMark(both.text, both.start, both.end, 'italic'); assert.equal(noItalic.text, '**word**');
  const noBold = toggleMark(both.text, both.start, both.end, 'bold'); assert.equal(noBold.text, '*word*');
});

test('font sizes step through the menu sizes and stay within limits', () => {
  assert.equal(stepSize(undefined, 1), 18); assert.equal(stepSize(16, -1), 14); assert.equal(stepSize(96, 1), 96); assert.equal(stepSize(8, -1), 8); assert.equal(stepSize(13, 1), 14);
  assert.equal(clampSize(3), 8); assert.equal(clampSize(500), 96); assert.equal(clampSize(12.4), 12);
});

test('layout attributes are validated, kept in a fixed order and left out when they are the default', () => {
  const block = { id: 'a', type: 'PARAGRAPH', text: 'x', align: 'center', spacing: 1.5, font: 'serif', size: 20 };
  assert.deepEqual(normalizeBlock(block), { id: 'a', type: 'PARAGRAPH', text: 'x', checked: false, align: 'center', spacing: 1.5, font: 'serif', size: 20 });
  assert.deepEqual(normalizeBlock({ ...block, align: 'left', spacing: 9, font: 'comic', size: 2.5 }), { id: 'a', type: 'PARAGRAPH', text: 'x', checked: false });
});

test('layout survives the trip into the editor document and back', () => {
  const block = normalizeBlock({ id: 'a', type: 'HEADING_2', text: 'T', align: 'right', spacing: 2, font: 'mono', size: 30 });
  assert.deepEqual(nodeToBlock(blockToNode(block)), block);
  const plain = normalizeBlock({ id: 'b', type: 'PARAGRAPH', text: 'p' }); assert.deepEqual(nodeToBlock(blockToNode(plain)), plain);
});

test('setLayout changes only the chosen blocks that can take it, and returns the same list when nothing changes', () => {
  const blocks = [{ id: 'a', type: 'PARAGRAPH', text: 'a', checked: false }, { id: 'b', type: 'CODE', text: 'b', checked: false }, { id: 'c', type: 'PARAGRAPH', text: 'c', checked: false }];
  const next = setLayout(blocks, ['a', 'b'], { align: 'center', size: 24 });
  assert.equal(next[0].align, 'center'); assert.equal(next[1].align, undefined, 'code keeps its own look'); assert.equal(next[2].align, undefined);
  assert.equal(setLayout(next, ['a'], { align: 'center' }), next);
  assert.equal(setLayout(next, ['a'], { align: undefined })[0].align, undefined);
  assert.equal(isFormattable('TABLE'), false);
});

test('clearing formatting removes marks, colours and layout but keeps words, links labels and structure', () => {
  const block = normalizeBlock({ id: 'a', type: 'BULLET', text: '**b** and {red:r} and [l](https://a.test)', align: 'center', size: 20, indent: 1 });
  const cleared = clearBlockFormatting(block);
  assert.equal(cleared.text, 'b and r and l'); assert.equal(cleared.align, undefined); assert.equal(cleared.size, undefined); assert.equal(cleared.type, 'BULLET'); assert.equal(cleared.indent, 1);
  assert.equal(plainFormat('a ***x*** b'), 'a x b'); assert.equal(plainFormat('{red:**inner** words}'), 'inner words'); assert.equal(plainFormat('2 * 3 * 4'), '2 * 3 * 4');
  assert.equal(clearBlockFormatting({ id: 'c', type: 'CODE', text: '**keep**', checked: false }).text, '**keep**');
});
