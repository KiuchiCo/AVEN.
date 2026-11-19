import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

/** Opens the live stream and collects events until the test closes it. */
async function listen(t, who, workspaceId) {
  const abort = new AbortController(); const events = [];
  const response = await fetch(`${t.base}/workspaces/${workspaceId}/channels/stream`, { headers: t.headers(who), signal: abort.signal });
  if (!response.ok) { abort.abort(); return { status: response.status, events, close() {} }; }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) return; buffer += decoder.decode(value); let i; while ((i = buffer.indexOf('\n\n')) >= 0) { const block = buffer.slice(0, i); buffer = buffer.slice(i + 2); if (block.startsWith('data: ')) events.push(JSON.parse(block.slice(6))); } } } catch { /* closed */ } })();
  return { status: 200, events, close: () => abort.abort() };
}
const until = async (fn) => { for (let i = 0; i < 50; i += 1) { if (fn()) return; await new Promise((r) => setTimeout(r, 40)); } assert.fail('timed out waiting for the live event'); };

describe('channels and messages', { skip }, () => {
  let t; let W; let O;
  const ws = (w = W) => `/workspaces/${w.id}/channels`;

  before(async () => {
    t = await boot();
    for (const name of ['ana', 'ben', 'gil', 'zed']) await t.user(name);
    W = await t.workspace('ana'); await t.member(W.id, 'ben', 'MEMBER'); await t.member(W.id, 'gil', 'GUEST'); O = await t.workspace('zed');
  });
  after(async () => { await t?.close(); });

  test('channels: create, normalise names, refuse duplicates, guests cannot create, outsiders see nothing', async () => {
    const made = await t.call('ana', 'POST', ws(), { name: 'Design Team', topic: 'Pixels' });
    assert.equal(made.status, 201); assert.equal(made.body.name, 'design-team');
    assert.equal((await t.call('ben', 'POST', ws(), { name: 'DESIGN-team' })).status, 409);
    assert.equal((await t.call('ana', 'POST', ws(), { name: 'no way!' })).status, 400);
    assert.equal((await t.call('gil', 'POST', ws(), { name: 'x' })).status, 403);
    assert.equal((await t.call('zed', 'GET', ws())).status, 404);
    assert.equal((await t.call('gil', 'GET', ws())).body.length, 1);
    assert.equal((await t.call('zed', 'GET', ws(O))).body.length, 0);
  });

  test('messages: send, page, edit own only, delete rules, guests read only, other workspaces blocked', async () => {
    const channel = (await t.call('ana', 'POST', ws(), { name: 'general' })).body;
    const base = `${ws()}/${channel.id}/messages`;
    const first = await t.call('ana', 'POST', base, { body: 'Hello team' });
    assert.equal(first.status, 201);
    for (let i = 0; i < 54; i += 1) await t.call('ben', 'POST', base, { body: `msg ${i}` });
    const page = (await t.call('gil', 'GET', base)).body;
    assert.equal(page.messages.length, 50); assert.equal(page.hasMore, true); assert.equal(page.messages.at(-1).body, 'msg 53');
    const older = (await t.call('gil', 'GET', `${base}?before=${encodeURIComponent(page.messages[0].createdAt)}`)).body;
    assert.equal(older.messages.length, 5); assert.equal(older.hasMore, false); assert.equal(older.messages[0].body, 'Hello team');
    assert.equal((await t.call('gil', 'POST', base, { body: 'hi' })).status, 403);
    assert.equal((await t.call('ben', 'PATCH', `${base}/${first.body.id}`, { body: 'hijack' })).status, 404);
    assert.equal((await t.call('ana', 'PATCH', `${base}/${first.body.id}`, { body: 'Hello everyone' })).body.body, 'Hello everyone');
    const bens = page.messages.at(-1);
    assert.equal((await t.call('gil', 'DELETE', `${base}/${bens.id}`)).status, 403);
    assert.equal((await t.call('ana', 'DELETE', `${base}/${bens.id}`)).status, 200, 'an owner can delete anyone’s message');
    const after = (await t.call('ana', 'GET', base)).body.messages.find((m) => m.id === bens.id);
    assert.equal(after.body, ''); assert.ok(after.deletedAt);
    assert.equal((await t.call('zed', 'GET', base)).status, 404);
    assert.equal((await t.call('zed', 'GET', `${ws(O)}/${channel.id}/messages`)).status, 404, 'a channel is not readable through another workspace');
    assert.equal((await t.call('ana', 'POST', base, { body: '   ' })).status, 400);
  });

  test('unread counts exclude your own messages and clear when read', async () => {
    const channel = (await t.call('ana', 'POST', ws(), { name: 'news' })).body;
    const base = `${ws()}/${channel.id}`;
    await t.call('ana', 'POST', `${base}/messages`, { body: 'one' }); await t.call('ana', 'POST', `${base}/messages`, { body: 'two' });
    const count = async (who) => (await t.call(who, 'GET', ws())).body.find((c) => c.id === channel.id).unread;
    assert.equal(await count('ben'), 2); assert.equal(await count('ana'), 0);
    await t.call('ben', 'POST', `${base}/read`); assert.equal(await count('ben'), 0);
    await t.call('ana', 'POST', `${base}/messages`, { body: 'three' }); assert.equal(await count('ben'), 1);
  });

  test('the live stream pushes new messages and edits to members only', async () => {
    const channel = (await t.call('ana', 'POST', ws(), { name: 'live' })).body;
    assert.equal((await listen(t, 'zed', W.id)).status, 404, 'outsiders cannot listen');
    const watching = await listen(t, 'gil', W.id); const other = await listen(t, 'zed', O.id);
    try {
      const sent = await t.call('ben', 'POST', `${ws()}/${channel.id}/messages`, { body: 'ping' });
      await until(() => watching.events.some((e) => e.type === 'message' && e.message.id === sent.body.id));
      await t.call('ben', 'PATCH', `${ws()}/${channel.id}/messages/${sent.body.id}`, { body: 'pong' });
      await until(() => watching.events.some((e) => e.type === 'message_updated' && e.message.body === 'pong'));
      await t.call('ben', 'DELETE', `${ws()}/${channel.id}/messages/${sent.body.id}`);
      await until(() => watching.events.some((e) => e.type === 'message_deleted'));
      assert.equal(other.events.length, 0, 'another workspace heard nothing');
    } finally { watching.close(); other.close(); }
  });
});
