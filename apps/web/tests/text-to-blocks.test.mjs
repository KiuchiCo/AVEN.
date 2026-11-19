import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeBlocks, textToBlocks, titleFromText } from '../app/workspace/intelligence/text-to-blocks.ts';

const shape = (text) => textToBlocks(text).map((block) => [block.type, block.text, block.checked]);

test('headings, lists, quotes and tasks become the matching blocks', () => {
  assert.deepEqual(shape('# Plan\n## Steps\n### Detail\n- one\n* two\n1. first\n2) second\n> quoted\n- [ ] open\n- [x] done'), [
    ['HEADING_1', 'Plan', false], ['HEADING_2', 'Steps', false], ['HEADING_2', 'Detail', false], ['BULLET', 'one', false], ['BULLET', 'two', false],
    ['NUMBERED', 'first', false], ['NUMBERED', 'second', false], ['QUOTE', 'quoted', false], ['TODO', 'open', false], ['TODO', 'done', true]]);
});

test('wrapped lines join into one paragraph and blank lines separate paragraphs', () => {
  assert.deepEqual(shape('First line\nstill first\n\nSecond paragraph\n\n\n'), [['PARAGRAPH', 'First line still first', false], ['PARAGRAPH', 'Second paragraph', false]]);
  assert.deepEqual(shape('Intro\n- item\nOutro'), [['PARAGRAPH', 'Intro', false], ['BULLET', 'item', false], ['PARAGRAPH', 'Outro', false]]);
  assert.deepEqual(shape('   \n\n'), []);
});

test('blocks get unique ids and are capped in number and length', () => {
  const many = textToBlocks(Array.from({ length: 300 }, (_, i) => `- item ${i}`).join('\n'));
  assert.equal(many.length, 200);
  assert.equal(new Set(many.map((block) => block.id)).size, 200);
  assert.equal(textToBlocks('x'.repeat(5000))[0].text.length, 2000);
});

test('encoded documents use the editor format and stay under the size limit', () => {
  const doc = JSON.parse(encodeBlocks(textToBlocks('# T\nBody')));
  assert.equal(doc.format, 'aven-doc-v1');
  assert.equal(doc.blocks.length, 2);
  const huge = textToBlocks(Array.from({ length: 200 }, () => 'y'.repeat(2000)).join('\n\n'));
  const encoded = encodeBlocks(huge);
  assert.ok(encoded.length <= 100_000);
  assert.ok(JSON.parse(encoded).blocks.length >= 1);
});

test('titles come from the first heading or line, trimmed', () => {
  assert.equal(titleFromText('# Q4 summary\nBody'), 'Q4 summary');
  assert.equal(titleFromText('\n\n- first thing\nmore'), 'first thing');
  assert.equal(titleFromText('x'.repeat(200)).length, 80);
  assert.equal(titleFromText('   \n  '), 'AVEN Intelligence note');
});
