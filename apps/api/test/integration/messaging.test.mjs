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
      assert.equal(other.events.filter((e) => e.type !== 'presence').length, 0, 'another workspace heard nothing');
    } finally { watching.close(); other.close(); }
  });

  test('mentioning someone notifies them in the Inbox once; the author, outsiders and silent edits do not', async () => {
    const channel = (await t.call('ana', 'POST', ws(), { name: 'mentions' })).body;
    const base = `${ws()}/${channel.id}/messages`;
    const ben = await t.prisma.user.findFirstOrThrow({ where: { email: { contains: `ben-${t.run}` } } });
    const ana = await t.prisma.user.findFirstOrThrow({ where: { email: { contains: `ana-${t.run}` } } });
    const zed = await t.prisma.user.findFirstOrThrow({ where: { email: { contains: `zed-${t.run}` } } });
    const inbox = async (who) => (await t.call(who, 'GET', `/workspaces/${W.id}/activity/inbox`)).body;
    const count = async (who) => (await inbox(who)).filter((n) => n.message === 'mentioned you in #mentions').length;
    const sent = await t.call('ana', 'POST', base, { body: `Hey @[Ben](${ben.id}) and @[Me](${ana.id}) and @[Outsider](${zed.id})` });
    assert.equal(sent.status, 201);
    assert.equal(await count('ben'), 1); assert.equal(await count('ana'), 0, 'you are not told about mentioning yourself');
    const rows = await t.prisma.activityReceipt.count({ where: { activity: { entityId: channel.id, workspaceId: W.id } } });
    assert.equal(rows, 1, 'only the workspace member was notified');
    await t.call('ana', 'PATCH', `${base}/${sent.body.id}`, { body: `Hey @[Ben](${ben.id}), typo fixed` });
    assert.equal(await count('ben'), 1, 'an edit that adds nobody notifies nobody');
    await t.call('ana', 'PATCH', `${base}/${sent.body.id}`, { body: `Hey @[Ben](${ben.id}) and @[Gil](${(await t.prisma.user.findFirstOrThrow({ where: { email: { contains: `gil-${t.run}` } } })).id})` });
    assert.equal(await count('ben'), 1); assert.equal(await count('gil'), 1, 'only the newly added person is told');
  });

  describe('direct and group conversations, threads, search, presence', () => {
    let ids;
    const idOf = async (name) => (await t.prisma.user.findFirstOrThrow({ where: { email: { contains: `${name}-${t.run}` } } })).id;
    before(async () => { ids = { ana: await idOf('ana'), ben: await idOf('ben'), gil: await idOf('gil'), zed: await idOf('zed') }; await t.user('cal'); ids.cal = await idOf('cal'); await t.member(W.id, 'cal', 'MEMBER'); });
    const start = (who, userIds, w = W) => t.call(who, 'POST', `${ws(w)}/conversations`, { userIds });

    test('a direct conversation is one per pair; guests and outsiders cannot join; strangers cannot see it', async () => {
      const first = await start('ana', [ids.ben]); const again = await start('ben', [ids.ana]);
      assert.equal(first.status, 201); assert.equal(first.body.kind, 'DIRECT'); assert.equal(again.body.id, first.body.id, 'the same pair always gets the same conversation');
      assert.deepEqual(first.body.participants.map((p) => p.id).sort(), [ids.ana, ids.ben].sort());
      assert.equal((await start('ana', [ids.gil])).status, 400, 'a guest cannot be in a conversation');
      assert.equal((await start('gil', [ids.ana])).status, 403);
      assert.equal((await start('ana', [ids.zed])).status, 404, 'someone from another workspace is not found');
      assert.equal((await start('ana', [ids.ana])).status, 400);
      const base = `${ws()}/${first.body.id}/messages`;
      assert.equal((await t.call('ben', 'POST', base, { body: 'secret plan' })).status, 201);
      for (const who of ['cal', 'gil', 'zed']) {
        assert.equal((await t.call(who, 'GET', base)).status, 404, `${who} cannot read it`);
        assert.equal((await t.call(who, 'POST', base, { body: 'hi' })).status, who === 'gil' ? 403 : 404);
      }
      assert.equal((await t.call('cal', 'GET', ws())).body.some((c) => c.id === first.body.id), false, 'it is not even listed');
      assert.equal((await t.call('ben', 'GET', ws())).body.find((c) => c.id === first.body.id).unread, 0);
      assert.equal((await t.call('ana', 'GET', ws())).body.find((c) => c.id === first.body.id).unread, 1);
    });

    test('a group has its own people; private messages never reach the live stream of others or the search', async () => {
      const group = await start('ana', [ids.ben, ids.cal]); assert.equal(group.body.kind, 'GROUP'); assert.equal(group.body.participants.length, 3);
      assert.notEqual((await start('ana', [ids.ben, ids.cal])).body.id, group.body.id, 'each group is new');
      const outsiderStream = await listen(t, 'gil', W.id); const memberStream = await listen(t, 'cal', W.id);
      try {
        await t.call('ana', 'POST', `${ws()}/${group.body.id}/messages`, { body: 'zebra crossing plans' });
        await until(() => memberStream.events.some((e) => e.type === 'message' && e.message.body === 'zebra crossing plans'));
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert.equal(outsiderStream.events.some((e) => e.type === 'message' && e.message.body === 'zebra crossing plans'), false, 'a non-participant heard a private message');
      } finally { outsiderStream.close(); memberStream.close(); }
      const found = async (who, q) => (await t.call(who, 'GET', `${ws()}/search?q=${encodeURIComponent(q)}`)).body;
      assert.equal((await found('cal', 'zebra')).length, 1); assert.equal((await found('gil', 'zebra')).length, 0, 'search skips conversations you are not in');
      assert.equal((await t.call('ana', 'GET', `${ws()}/search?q=z`)).status, 400);
    });

    test('mentions in a private conversation only notify its people', async () => {
      const dm = (await start('ana', [ids.ben])).body; const marker = `m${t.run}`;
      await t.call('ana', 'POST', `${ws()}/${dm.id}/messages`, { body: `ping @[Ben](${ids.ben}) @[Cal](${ids.cal}) ${marker}` });
      const inbox = async (who) => (await t.call(who, 'GET', `/workspaces/${W.id}/activity/inbox`)).body.filter((n) => n.message === 'mentioned you in a conversation').length;
      assert.equal(await inbox('ben'), 1); assert.equal(await inbox('cal'), 0, 'cal is not in the conversation, so is not told what it says');
    });

    test('threads: replies belong to a message, are counted, and cannot nest', async () => {
      const channel = (await t.call('ana', 'POST', ws(), { name: 'threads' })).body; const base = `${ws()}/${channel.id}/messages`;
      const root = (await t.call('ana', 'POST', base, { body: 'root' })).body;
      const reply = await t.call('ben', 'POST', base, { body: 'first reply', parentId: root.id });
      assert.equal(reply.status, 201); assert.equal(reply.body.parentId, root.id);
      assert.equal((await t.call('ben', 'POST', base, { body: 'nested', parentId: reply.body.id })).status, 400, 'no replies to replies');
      assert.equal((await t.call('ben', 'POST', base, { body: 'bad', parentId: '11111111-1111-4111-8111-111111111111' })).status, 400);
      const main = (await t.call('cal', 'GET', base)).body.messages;
      assert.deepEqual(main.map((m) => m.body), ['root'], 'replies stay out of the main thread'); assert.equal(main[0].replyCount, 1);
      const thread = (await t.call('cal', 'GET', `${base}/${root.id}/replies`)).body;
      assert.equal(thread.root.id, root.id); assert.deepEqual(thread.replies.map((m) => m.body), ['first reply']);
      assert.equal((await t.call('gil', 'GET', `${base}/${root.id}/replies`)).status, 200, 'guests can read threads');
      await t.call('ben', 'DELETE', `${base}/${reply.body.id}`); assert.equal((await t.call('cal', 'GET', base)).body.messages[0].replyCount, 0);
    });

    test('presence shows who has the workspace open', async () => {
      const watcher = await listen(t, 'ana', W.id);
      try {
        await until(() => watcher.events.some((e) => e.type === 'presence' && e.online.includes(ids.ana)));
        const ben = await listen(t, 'ben', W.id);
        await until(() => watcher.events.some((e) => e.type === 'presence' && e.online.includes(ids.ben)));
        ben.close();
        await until(() => { const last = [...watcher.events].reverse().find((e) => e.type === 'presence'); return last && !last.online.includes(ids.ben); });
      } finally { watcher.close(); }
    });
  });
});

