import assert from 'node:assert/strict';
import { test } from 'node:test';
import { documentPlainText } from '../dist/productivity/document-text.js';

const doc = (blocks) => JSON.stringify({ format: 'aven-doc-v1', blocks });
test('block documents give their text, including table cells and image captions', () => {
  const text = documentPlainText(doc([{ type: 'HEADING_1', text: 'Plan' }, { type: 'TABLE', text: '', rows: [['Owner', 'Due'], ['Ana', '', 'Friday']] }, { type: 'IMAGE', text: 'Site map', fileId: 'x' }, { type: 'DIVIDER', text: '' }]));
  assert.equal(text, 'Plan Owner Due Ana Friday Site map');
});
test('plain-text and malformed documents come back as they are', () => {
  assert.equal(documentPlainText('Just words'), 'Just words'); assert.equal(documentPlainText('{"oops'), '{"oops');
  assert.equal(documentPlainText(doc([{ type: 'TABLE', rows: 'bad' }, { type: 'PARAGRAPH', text: 5 }])), '');
});
