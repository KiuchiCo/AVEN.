import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

/** Opens the live stream and collects events until closed. */
async function listen(t, who, workspaceId) {
  const abort = new AbortController(); const events = [];
  const response = await fetch(`${t.base}/workspaces/${workspaceId}/channels/stream`, { headers: t.headers(who), signal: abort.signal });
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) return; buffer += decoder.decode(value); let i; while ((i = buffer.indexOf('\n\n')) >= 0) { const block = buffer.slice(0, i); buffer = buffer.slice(i + 2); const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join(''); if (data) events.push(JSON.parse(data)); } } } catch { /* closed */ } })();
  return { events, close: () => abort.abort() };
}
const until = async (fn) => { for (let i = 0; i < 50; i += 1) { if (fn()) return; await new Promise((r) => setTimeout(r, 40)); } assert.fail('timed out waiting for the live event'); };

describe('message reactions', { skip }, () => {
  let t; let W; let O;
  const ws = (w = W) => `/workspaces/${w.id}/channels`;

  before(async () => {
    t = await boot();
    for (const name of ['ana', 'ben', 'cal', 'gil', 'zed']) await t.user(name);
    W = await t.workspace('ana'); await t.member(W.id, 'ben', 'MEMBER'); await t.member(W.id, 'cal', 'MEMBER'); await t.member(W.id, 'gil', 'GUEST'); O = await t.workspace('zed');
  });
  after(async () => { await t?.close(); });

  test('add, count across people, repeat safely, remove, and show with the message', async () => {
    const channel = (await t.call('ana', 'POST', ws(), { name: 'reactions' })).body;
    const message = (await t.call('ana', 'POST', `${ws()}/${channel.id}/messages`, { body: 'Ship it?' })).body;
    assert.deepEqual(message.reactions, []);
    const url = `${ws()}/${channel.id}/messages/${message.id}/reactions`;
    const ids = {}; for (const name of ['ana', 'ben']) ids[name] = (await t.call(name, 'GET', '/session/me')).body.id;

    const first = await t.call('ben', 'POST', url, { emoji: '👍', active: true });
    assert.equal(first.status, 201); assert.deepEqual(first.body.reactions, [{ emoji: '👍', userIds: [ids.ben] }]);
    assert.deepEqual((await t.call('ben', 'POST', url, { emoji: '👍', active: true })).body.reactions, [{ emoji: '👍', userIds: [ids.ben] }], 'a repeated tap changes nothing');
    await t.call('ana', 'POST', url, { emoji: '👍', active: true });
    const both = (await t.call('ana', 'POST', url, { emoji: '🎉', active: true })).body.reactions;
    assert.deepEqual(both, [{ emoji: '👍', userIds: [ids.ben, ids.ana] }, { emoji: '🎉', userIds: [ids.ana] }], 'offered order, then by who reacted first');

    assert.deepEqual((await t.call('ben', 'POST', url, { emoji: '👍', active: false })).body.reactions, [{ emoji: '👍', userIds: [ids.ana] }, { emoji: '🎉', userIds: [ids.ana] }]);
    assert.deepEqual((await t.call('ben', 'POST', url, { emoji: '👍', active: false })).body.reactions.length, 2, 'removing twice is harmless');

    const listed = (await t.call('cal', 'GET', `${ws()}/${channel.id}/messages`)).body.messages.find((row) => row.id === message.id);
    assert.deepEqual(listed.reactions, [{ emoji: '👍', userIds: [ids.ana] }, { emoji: '🎉', userIds: [ids.ana] }]);
  });

  test('refuses unknown emoji, guests, outsiders, private conversations and deleted messages', async () => {
    const channel = (await t.call('ana', 'POST', ws(), { name: 'rules' })).body;
    const message = (await t.call('ana', 'POST', `${ws()}/${channel.id}/messages`, { body: 'Rules' })).body;
    const url = `${ws()}/${channel.id}/messages/${message.id}/reactions`;
    assert.equal((await t.call('ben', 'POST', url, { emoji: '💩', active: true })).status, 400);
    assert.equal((await t.call('ben', 'POST', url, { emoji: '👍' })).status, 400, 'active is required');
    assert.equal((await t.call('ben', 'POST', url, { emoji: '<script>', active: true })).status, 400);
    assert.equal((await t.call('gil', 'POST', url, { emoji: '👍', active: true })).status, 403, 'guests read only');
    assert.equal((await t.call('zed', 'POST', url, { emoji: '👍', active: true })).status, 404, 'other workspaces see nothing');
    assert.equal((await t.call('zed', 'POST', `${ws(O)}/${channel.id}/messages/${message.id}/reactions`, { emoji: '👍', active: true })).status, 404, 'a message is only reachable through its own workspace');

    const dm = (await t.call('ana', 'POST', `${ws()}/conversations`, { userIds: [(await t.call('ben', 'GET', '/session/me')).body.id] })).body;
    const secret = (await t.call('ana', 'POST', `${ws()}/${dm.id}/messages`, { body: 'Just us' })).body;
    assert.equal((await t.call('cal', 'POST', `${ws()}/${dm.id}/messages/${secret.id}/reactions`, { emoji: '👍', active: true })).status, 404, 'not in the conversation');
    assert.equal((await t.call('ben', 'POST', `${ws()}/${dm.id}/messages/${secret.id}/reactions`, { emoji: '❤️', active: true })).status, 201);

    await t.call('ben', 'POST', url, { emoji: '✅', active: true });
    assert.equal((await t.call('ana', 'DELETE', `${ws()}/${channel.id}/messages/${message.id}`)).status, 200);
    assert.equal((await t.call('ben', 'POST', url, { emoji: '👍', active: true })).status, 404, 'a deleted message takes no reactions');
    const gone = (await t.call('ana', 'GET', `${ws()}/${channel.id}/messages`)).body.messages.find((row) => row.id === message.id);
    assert.deepEqual(gone.reactions, [], 'reactions go with the message');
    assert.equal(await t.prisma.channelMessageReaction.count({ where: { messageId: message.id } }), 0);
  });

  test('everyone in the conversation hears reaction changes live; people outside a private one do not', async () => {
    const channel = (await t.call('ana', 'POST', ws(), { name: 'live-reactions' })).body;
    const message = (await t.call('ana', 'POST', `${ws()}/${channel.id}/messages`, { body: 'Live' })).body;
    const watcher = await listen(t, 'cal', W.id);
    try {
      await new Promise((r) => setTimeout(r, 150));
      await t.call('ben', 'POST', `${ws()}/${channel.id}/messages/${message.id}/reactions`, { emoji: '😂', active: true });
      await until(() => watcher.events.some((event) => event.type === 'message_reactions' && event.messageId === message.id));
      const event = watcher.events.find((row) => row.type === 'message_reactions');
      assert.equal(event.channelId, channel.id); assert.equal(event.reactions[0].emoji, '😂');

      const dm = (await t.call('ana', 'POST', `${ws()}/conversations`, { userIds: [(await t.call('ben', 'GET', '/session/me')).body.id] })).body;
      const secret = (await t.call('ana', 'POST', `${ws()}/${dm.id}/messages`, { body: 'Private' })).body;
      await t.call('ben', 'POST', `${ws()}/${dm.id}/messages/${secret.id}/reactions`, { emoji: '🙏', active: true });
      await new Promise((r) => setTimeout(r, 300));
      assert.ok(!watcher.events.some((event) => event.type === 'message_reactions' && event.messageId === secret.id), 'cal is not in the private conversation');
    } finally { watcher.close(); }
  });
});
