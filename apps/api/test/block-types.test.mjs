import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicBlocks } from '../dist/sharing/share-rules.js';
import { documentPlainText } from '../dist/productivity/document-text.js';
import { isTextBlock } from '../dist/productivity/text-blocks.js';

const doc = (blocks) => JSON.stringify({ format: 'aven-doc-v1', blocks });

test('a shared document includes small headings and toggles, and drops blocks that only make sense inside the workspace', () => {
  const shared = publicBlocks(doc([
    { id: 'a', type: 'HEADING_3', text: 'Small' }, { id: 'b', type: 'TOGGLE', text: 'More', body: 'Hidden detail', level: 2 },
    { id: 'c', type: 'DATABASE', databaseId: 'x', view: 'TABLE' }, { id: 'd', type: 'BUTTON', text: 'Go', body: 'task' }, { id: 'e', type: 'PAGE_LINK', docId: 'y' },
  ]), (f) => `/img/${f}`);
  assert.deepEqual(shared.map((block) => block.type), ['HEADING_3', 'TOGGLE']);
  assert.equal(shared[1].body, 'Hidden detail'); assert.equal(shared[1].level, 2);
});

test('toggle content is searchable, and workspace-only blocks are never live text sessions', () => {
  assert.equal(documentPlainText(doc([{ type: 'TOGGLE', text: 'Checklist', body: 'buy milk' }])), 'Checklist buy milk');
  for (const type of ['VIDEO', 'AUDIO', 'FILE', 'BOOKMARK', 'PAGE_LINK', 'DATABASE', 'DATABASE_LINK', 'TOC', 'BREADCRUMB', 'BUTTON']) assert.equal(isTextBlock({ id: 'x', type, text: 'caption' }), false, type);
  for (const type of ['PARAGRAPH', 'HEADING_3', 'HEADING_4', 'TOGGLE']) assert.equal(isTextBlock({ id: 'x', type, text: 'hi' }), true, type);
});
