import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

/** Opens a live stream on one instance and collects its events. */
async function listen(base, subject, path) {
  const abort = new AbortController(); const state = { events: [], ended: false };
  const response = await fetch(`${base}${path}`, { headers: { 'x-test-user': subject }, signal: abort.signal });
  state.status = response.status; if (!response.ok) return state;
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) { state.ended = true; return; } buffer += decoder.decode(value); let i; while ((i = buffer.indexOf('\n\n')) >= 0) { const block = buffer.slice(0, i); buffer = buffer.slice(i + 2); const line = block.split('\n').find((l) => l.startsWith('data: ')); if (line) state.events.push(JSON.parse(line.slice(6))); } } } catch { state.ended = true; } })();
  state.close = () => abort.abort(); return state;
}
const until = async (fn, what, ms = 6000) => { for (let i = 0; i < ms / 50; i += 1) { if (await fn()) return; await new Promise((r) => setTimeout(r, 50)); } assert.fail(`timed out: ${what}`); };
const quiet = (ms = 600) => new Promise((r) => setTimeout(r, ms));

describe('realtime: two API instances share live events through PostgreSQL', { skip }, () => {
  let A; let B; let W; let X; let subjects; let channel; let doc;
  before(async () => {
    A = await boot({ REALTIME_BUS: 'postgres', STREAM_RECHECK_MS: '400' }); B = await boot({ REALTIME_BUS: 'postgres' });
    for (const n of ['olga', 'mike', 'nina', 'xena']) await A.user(n);
    W = await A.workspace('olga', 'Shared'); X = await A.workspace('xena', 'Other');
    await A.member(W.id, 'mike', 'MEMBER'); await A.member(W.id, 'nina', 'MEMBER');
    subjects = Object.fromEntries(await Promise.all(['olga', 'mike', 'nina', 'xena'].map(async (n) => [n, (await A.prisma.user.findFirst({ where: { displayName: n, email: { contains: A.run } } })).identitySubject])));
    await new Promise((r) => setTimeout(r, 500)); // both listeners are connected
    channel = (await A.call('olga', 'POST', `/workspaces/${W.id}/channels`, { name: 'general' })).body;
    doc = (await A.call('olga', 'POST', `/workspaces/${W.id}/documents`, { title: 'Plan', content: '' })).body;
  });
  after(async () => { await A?.close(); await B?.close(); });
  const post = (who, text) => fetch(`${A.base}/workspaces/${W.id}/channels/${channel.id}/messages`, { method: 'POST', headers: { 'x-test-user': subjects[who], 'content-type': 'application/json' }, body: JSON.stringify({ body: text }) });

  test('a message sent on one instance reaches people connected to the other, and only people in that workspace', async () => {
    const mike = await listen(B.base, subjects.mike, `/workspaces/${W.id}/channels/stream`);
    const xena = await listen(B.base, subjects.xena, `/workspaces/${X.id}/channels/stream`);
    assert.equal(mike.status, 200); assert.equal(xena.status, 200);
    assert.equal((await post('olga', 'hello from instance A')).status, 201);
    await until(() => mike.events.some((e) => e.type === 'message' && e.message.body === 'hello from instance A'), 'mike hears it on instance B');
    await quiet(); assert.ok(!JSON.stringify(xena.events).includes('hello from instance A'), 'another workspace never hears it');
    mike.close(); xena.close();
  });

  test('a private conversation is heard only by its people, on either instance', async () => {
    const dm = (await A.call('olga', 'POST', `/workspaces/${W.id}/channels/conversations`, { userIds: [(await A.prisma.user.findFirst({ where: { displayName: 'mike', email: { contains: A.run } } })).id] })).body;
    const mike = await listen(B.base, subjects.mike, `/workspaces/${W.id}/channels/stream`); const nina = await listen(B.base, subjects.nina, `/workspaces/${W.id}/channels/stream`);
    await fetch(`${A.base}/workspaces/${W.id}/channels/${dm.id}/messages`, { method: 'POST', headers: { 'x-test-user': subjects.olga, 'content-type': 'application/json' }, body: JSON.stringify({ body: 'private words' }) });
    await until(() => mike.events.some((e) => e.type === 'message' && e.message.body === 'private words'), 'mike hears his conversation');
    await quiet(); assert.ok(!JSON.stringify(nina.events).includes('private words'), 'a workspace member outside the conversation hears nothing');
    mike.close(); nina.close();
  });

  test('a save on one instance tells people with the document open on the other', async () => {
    const mike = await listen(B.base, subjects.mike, `/workspaces/${W.id}/documents/${doc.id}/stream`);
    await until(() => mike.events.some((e) => e.type === 'presence'), 'stream open');
    const saved = await fetch(`${A.base}/workspaces/${W.id}/documents/${doc.id}`, { method: 'PATCH', headers: { 'x-test-user': subjects.olga, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Plan v2', baseUpdatedAt: doc.updatedAt }) });
    assert.equal(saved.status, 200);
    await until(() => mike.events.some((e) => e.type === 'saved'), 'mike hears the save on instance B'); mike.close();
  });

  test('someone removed from the workspace stops receiving, even when the event comes from another instance', async () => {
    const nina = await listen(A.base, subjects.nina, `/workspaces/${W.id}/channels/stream`);
    await A.prisma.workspaceMember.deleteMany({ where: { workspaceId: W.id, user: { displayName: 'nina', email: { contains: A.run } } } });
    await until(() => nina.ended, 'the server ends the stream after removal');
    assert.equal((await listen(B.base, subjects.nina, `/workspaces/${W.id}/channels/stream`)).status, 404, 'and she cannot reconnect through the other instance either');
  });

  test('if the bus connection is lost, same-instance delivery keeps working and the bus reconnects by itself', async () => {
    const mikeA = await listen(A.base, subjects.mike, `/workspaces/${W.id}/channels/stream`); const mikeB = await listen(B.base, subjects.mike, `/workspaces/${W.id}/channels/stream`);
    await A.prisma.$queryRaw`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE 'LISTEN aven_realtime%' AND pid <> pg_backend_pid()`;
    await quiet(100); await post('olga', 'during the outage');
    await until(() => mikeA.events.some((e) => e.message?.body === 'during the outage'), 'people on the sending instance still hear it');
    await until(async () => { await post('olga', 'after reconnect'); await quiet(100); return mikeB.events.some((e) => e.message?.body === 'after reconnect'); }, 'the other instance hears again once the bus has reconnected', 12000);
    mikeA.close(); mikeB.close();
  });

  test('a duplicate notification is delivered once, a malformed one is ignored, and an oversized event becomes a "refresh"', async () => {
    const { RealtimeBus } = await import('../../dist/realtime/realtime-bus.js'); const { metrics } = await import('../../dist/observability/metrics.js');
    const url = process.env.INTEGRATION_DATABASE_URL.replace(/\?.*$/, '');
    const sender = new RealtimeBus(url); const receiver = new RealtimeBus(url); const heard = [];
    receiver.on('channel', (message) => heard.push(message));
    await sender.onModuleInit(); await receiver.onModuleInit();
    const envelope = JSON.stringify({ id: 'x:1', origin: 'someone-else', topic: 'channel', scope: 'w1', event: { type: 'message' } });
    for (const payload of [envelope, envelope, 'not json', '{}']) await A.prisma.$executeRaw`SELECT pg_notify('aven_realtime', ${payload})`;
    await sender.publish({ topic: 'channel', scope: 'w2', event: { type: 'message', message: { body: 'x'.repeat(9000) } } });
    await until(() => heard.length >= 2, 'both events arrive'); await quiet();
    assert.equal(heard.filter((m) => m.scope === 'w1').length, 1, 'the duplicate was dropped'); assert.equal(heard.find((m) => m.scope === 'w2').oversize, true);
    assert.match(metrics.render(), /realtime_duplicates_total [1-9]/); assert.match(metrics.render(), /realtime_oversize_events_total [1-9]/);
    await sender.onModuleDestroy(); await receiver.onModuleDestroy();
  });
});
