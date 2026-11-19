import assert from 'node:assert/strict';
import { test } from 'node:test';
import { documentTemplates, encodeTemplate } from '../app/workspace/documents/templates.ts';

// Must stay in step with the block types the editor accepts.
const editorBlockTypes = ['PARAGRAPH', 'HEADING_1', 'HEADING_2', 'BULLET', 'NUMBERED', 'TODO', 'QUOTE', 'CODE', 'CALLOUT', 'DIVIDER'];

test('every template encodes to blocks the editor will accept', () => {
  for (const template of documentTemplates) {
    const doc = JSON.parse(encodeTemplate(template));
    assert.equal(doc.format, 'aven-doc-v1');
    assert.ok(doc.blocks.length > 0);
    for (const block of doc.blocks) {
      assert.equal(typeof block.id, 'string');
      assert.equal(typeof block.text, 'string');
      assert.ok(editorBlockTypes.includes(block.type), `${template.id}: ${block.type}`);
    }
  }
});

test('template ids are unique and encoded block ids are unique', () => {
  assert.equal(new Set(documentTemplates.map((template) => template.id)).size, documentTemplates.length);
  const ids = JSON.parse(encodeTemplate(documentTemplates[0])).blocks.map((block) => block.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('a leading note is added as the first paragraph and stays within the content limit', () => {
  const doc = JSON.parse(encodeTemplate(documentTemplates[0], '  Remember to book the room  '));
  assert.deepEqual([doc.blocks[0].type, doc.blocks[0].text], ['PARAGRAPH', 'Remember to book the room']);
  for (const template of documentTemplates) assert.ok(encodeTemplate(template).length < 100000);
});
