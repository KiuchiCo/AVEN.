import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

/** Opens a stream and records whether the server ended it. */
async function listen(t, who, path) {
  const abort = new AbortController(); const state = { events: [], ended: false };
  const response = await fetch(`${t.base}${path}`, { headers: t.headers(who), signal: abort.signal });
  state.status = response.status;
  if (!response.ok) return state;
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) { state.ended = true; return; } state.events.push(decoder.decode(value)); } } catch { /* closed by the test */ } })();
  state.close = () => abort.abort();
  return state;
}
const until = async (fn, what) => { for (let i = 0; i < 100; i += 1) { if (fn()) return; await new Promise((r) => setTimeout(r, 50)); } assert.fail(`timed out: ${what}`); };

describe('security: live streams stop serving someone who has lost access', { skip }, () => {
  let t; let W; let doc;
  before(async () => {
    t = await boot({ STREAM_RECHECK_MS: '300' });
    for (const n of ['own', 'ex']) await t.user(n);
    W = await t.workspace('own'); await t.member(W.id, 'ex', 'MEMBER');
    doc = (await t.call('own', 'POST', `/workspaces/${W.id}/documents`, { title: 'Plan', content: '' })).body;
  });
  after(async () => { await t?.close(); });

  test('a removed member’s message stream and document stream are closed by the server, and they hear nothing more', async () => {
    const chat = await listen(t, 'ex', `/workspaces/${W.id}/channels/stream`);
    const live = await listen(t, 'ex', `/workspaces/${W.id}/documents/${doc.id}/stream`);
    assert.equal(chat.status, 200); assert.equal(live.status, 200);
    await t.prisma.workspaceMember.deleteMany({ where: { workspaceId: W.id, user: { displayName: 'ex' } } });
    await until(() => chat.ended && live.ended, 'both streams to be closed after removal');
    const channel = (await t.call('own', 'POST', `/workspaces/${W.id}/channels`, { name: 'secret-plans' })).body;
    assert.equal(channel.name, 'secret-plans');
    assert.ok(!chat.events.join('').includes('secret-plans'));
  });

  test('a member who keeps their access stays connected', async () => {
    const chat = await listen(t, 'own', `/workspaces/${W.id}/channels/stream`);
    await new Promise((r) => setTimeout(r, 900));
    assert.equal(chat.ended, false); chat.close();
  });
});
