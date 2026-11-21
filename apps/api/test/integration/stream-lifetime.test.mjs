import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('security: a live stream does not outlive the sign-in it was opened with', { skip }, () => {
  let t; let W; let doc;
  before(async () => {
    t = await boot({ STREAM_RECHECK_MS: '5000', STREAM_MAX_MS: '700' });
    await t.user('lia'); W = await t.workspace('lia');
    doc = (await t.call('lia', 'POST', `/workspaces/${W.id}/documents`, { title: 'Plan', content: '' })).body;
  });
  after(async () => { await t?.close(); });

  const open = async (path) => {
    const response = await fetch(`${t.base}${path}`, { headers: t.headers('lia') }); const started = Date.now();
    const reader = response.body.getReader(); let ended = false;
    (async () => { try { for (;;) { const { done } = await reader.read(); if (done) { ended = true; return; } } } catch { ended = true; } })();
    return { status: response.status, ended: () => ended, age: () => Date.now() - started };
  };

  test('message and document streams are closed by the server after their lifetime, and a new one opens (and is verified again) at once', async () => {
    for (const path of [`/workspaces/${W.id}/channels/stream`, `/workspaces/${W.id}/documents/${doc.id}/stream`]) {
      const stream = await open(path); assert.equal(stream.status, 200);
      assert.equal(stream.ended(), false);
      for (let i = 0; i < 60 && !stream.ended(); i += 1) await new Promise((r) => setTimeout(r, 50));
      assert.equal(stream.ended(), true, path); assert.ok(stream.age() < 3000, `closed after ${stream.age()} ms`);
      assert.equal((await open(path)).status, 200, 'reconnecting works');
    }
  });
});
