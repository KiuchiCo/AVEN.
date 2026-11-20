import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SYNCED_TEXT, parseSyncedText } from '../dist/synced-blocks/synced-blocks.service.js';

test('synced text must be a string within the limit', () => {
  assert.equal(parseSyncedText({ text: 'hello' }), 'hello');
  assert.equal(parseSyncedText({ text: '' }), '');
  assert.throws(() => parseSyncedText({ text: 5 }));
  assert.throws(() => parseSyncedText(null));
  assert.throws(() => parseSyncedText({ text: 'x'.repeat(MAX_SYNCED_TEXT + 1) }));
});
