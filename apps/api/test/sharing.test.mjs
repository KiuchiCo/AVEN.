import assert from 'node:assert/strict';
import { test } from 'node:test';
import { imageFileIds, parseExpiry, publicBlocks, shareState } from '../dist/sharing/share-rules.js';

const id = '11111111-1111-4111-8111-111111111111';
const doc = (blocks) => JSON.stringify({ format: 'aven-doc-v1', blocks });
const url = (f) => `/img/${f}`;

test('a shared document keeps its words and structure but drops anything unknown', () => {
  const blocks = publicBlocks(doc([
    { id: 'a', type: 'HEADING_1', text: 'Plan', secret: 'x' }, { type: 'TODO', text: 'Ship', checked: true }, { type: 'WEIRD', text: 'hidden' },
    { type: 'TABLE', text: 'ignored', rows: [['a', 5, 'c'], 'bad'] }, { type: 'IMAGE', text: 'Map', fileId: id.toUpperCase() }, { type: 'IMAGE', text: 'Broken', fileId: 'not-a-uuid' }, { type: 'DIVIDER', text: '' },
  ]), url);
  assert.deepEqual(blocks.map((b) => b.type), ['HEADING_1', 'TODO', 'TABLE', 'IMAGE', 'IMAGE', 'DIVIDER']);
  assert.equal(blocks[0].secret, undefined); assert.equal(blocks[1].checked, true);
  assert.deepEqual(blocks[2].rows, [['a', '', 'c'], []]); assert.equal(blocks[2].text, '');
  assert.equal(blocks[3].image, `/img/${id}`, 'a file id becomes an address under the share'); assert.equal(blocks[4].image, null);
});
test('plain-text and broken documents are shown as text, and empty ones as nothing', () => {
  assert.deepEqual(publicBlocks('Just words', url), [{ type: 'PARAGRAPH', text: 'Just words' }]);
  assert.deepEqual(publicBlocks('', url), []); assert.deepEqual(publicBlocks('{"format":"aven-doc-v1","blocks":"no"}', url), [{ type: 'PARAGRAPH', text: '{"format":"aven-doc-v1","blocks":"no"}' }]);
});
test('only images the document itself uses can be served', () => {
  assert.deepEqual(imageFileIds(doc([{ type: 'IMAGE', fileId: id }, { type: 'IMAGE', fileId: id.toUpperCase() }, { type: 'PARAGRAPH', fileId: '22222222-2222-4222-8222-222222222222' }, { type: 'IMAGE', fileId: 'x' }])), [id]);
  assert.deepEqual(imageFileIds('plain text'), []);
});
test('expiry accepts known day counts or none, and state follows revocation and time', () => {
  assert.equal(parseExpiry(undefined), null); assert.equal(parseExpiry(null), null);
  assert.equal(parseExpiry(7, 0).getTime(), 7 * 86_400_000); for (const bad of [5, '7', 0, -1]) assert.throws(() => parseExpiry(bad), /days/);
  const now = Date.now();
  assert.equal(shareState({ revokedAt: null, expiresAt: null }, now), 'ACTIVE'); assert.equal(shareState({ revokedAt: null, expiresAt: new Date(now + 1000) }, now), 'ACTIVE');
  assert.equal(shareState({ revokedAt: null, expiresAt: new Date(now - 1) }, now), 'EXPIRED'); assert.equal(shareState({ revokedAt: new Date(), expiresAt: null }, now), 'REVOKED');
});
