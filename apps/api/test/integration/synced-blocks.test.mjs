import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('synced blocks', { skip }, () => {
  let t; let W; let O;
  const id = '5e0d1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
  before(async () => {
    t = await boot(); for (const n of ['syl', 'sam', 'sue', 'sid']) await t.user(n);
    W = await t.workspace('syl'); await t.member(W.id, 'sam', 'MEMBER'); await t.member(W.id, 'sue', 'GUEST'); O = await t.workspace('sid');
  });
  after(async () => { await t?.close(); });
  const path = (ws, block = id) => `/workspaces/${ws.id}/synced-blocks/${block}`;

  test('a block has no text until someone writes it; then every member reads the same text', async () => {
    assert.equal((await t.call('syl', 'GET', path(W))).status, 404);
    assert.equal((await t.call('syl', 'PUT', path(W), { text: 'Shared footer' })).status, 200);
    assert.equal((await t.call('sam', 'GET', path(W))).body.text, 'Shared footer');
    assert.equal((await t.call('sam', 'PUT', path(W), { text: 'Edited by Sam' })).status, 200);
    assert.equal((await t.call('syl', 'GET', path(W))).body.text, 'Edited by Sam', 'the last write wins');
  });

  test('guests can read but not write; bad input and bad ids are refused', async () => {
    assert.equal((await t.call('sue', 'GET', path(W))).status, 200);
    assert.equal((await t.call('sue', 'PUT', path(W), { text: 'nope' })).status, 403);
    assert.equal((await t.call('syl', 'PUT', path(W), { text: 5 })).status, 400);
    assert.equal((await t.call('syl', 'PUT', path(W), { text: 'x'.repeat(20_001) })).status, 400);
    assert.equal((await t.call('syl', 'GET', path(W, 'not-a-uuid'))).status, 400);
  });

  test('another workspace can neither read nor take over a block', async () => {
    assert.equal((await t.call('sid', 'GET', path(W))).status, 404);
    assert.equal((await t.call('sid', 'PUT', path(W), { text: 'hijack' })).status, 404);
    assert.equal((await t.call('sid', 'GET', path(O))).status, 404, 'the same id is not visible through its own workspace either');
    assert.equal((await t.call('syl', 'GET', path(W))).body.text, 'Edited by Sam');
  });
});
