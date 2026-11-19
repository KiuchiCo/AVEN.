import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('audit log', { skip }, () => {
  let t; let W; let ids;
  const url = (path = '') => `${t.base}/workspaces/${W.id}/audit${path}`;
  const get = (who, path) => fetch(url(path), { headers: t.headers(who) });
  const list = async (who, query = '') => (await t.call(who, 'GET', `/workspaces/${W.id}/audit${query}`));
  before(async () => {
    t = await boot();
    for (const name of ['olu', 'adm', 'mem', 'gst', 'out']) await t.user(name);
    W = await t.workspace('olu'); await t.member(W.id, 'adm', 'ADMINISTRATOR'); await t.member(W.id, 'mem', 'MEMBER'); await t.member(W.id, 'gst', 'GUEST');
    ids = { olu: (await t.prisma.user.findFirstOrThrow({ where: { email: { contains: `olu-${t.run}` } } })).id };
  });
  after(async () => { await t?.close(); });

  test('it is a Business and Enterprise feature, for owners and administrators only', async () => {
    const free = await list('olu'); assert.equal(free.status, 402); assert.match(free.body.message, /The audit log isn’t included in the Free plan/);
    await t.plan(W.id, 'PRO'); assert.equal((await list('olu')).status, 402, 'Pro does not include it');
    await t.plan(W.id, 'BUSINESS');
    assert.equal((await list('olu')).status, 200); assert.equal((await list('adm')).status, 200);
    assert.equal((await list('mem')).status, 403); assert.equal((await list('gst')).status, 403); assert.equal((await list('out')).status, 404);
    assert.equal((await get('mem', '/export')).status, 403); assert.equal((await get('mem', '/people')).status, 403);
  });

  test('it lists what happened, newest first, and can be filtered and paged', async () => {
    for (let i = 0; i < 55; i += 1) await t.call('olu', 'POST', `/workspaces/${W.id}/projects`, { name: `Project ${i}` });
    await t.call('mem', 'POST', `/workspaces/${W.id}/tasks`, { title: 'Member task' });
    const first = (await list('olu')).body;
    assert.equal(first.entries.length, 50); assert.ok(first.nextCursor); assert.ok(first.entries[0].createdAt >= first.entries[49].createdAt);
    assert.ok(first.entries.every((e) => e.actor.email && e.message));
    const second = (await list('olu', `?cursor=${encodeURIComponent(first.nextCursor)}`)).body;
    const seen = new Set(first.entries.map((e) => e.id)); assert.ok(second.entries.length > 0 && second.entries.every((e) => !seen.has(e.id)), 'the next page repeats nothing');
    const tasks = (await list('olu', '?entityType=TASK')).body.entries; assert.ok(tasks.length >= 1 && tasks.every((e) => e.entityType === 'TASK'));
    const byOwner = (await list('olu', `?actorId=${ids.olu}`)).body.entries; assert.ok(byOwner.every((e) => e.actor.id === ids.olu));
    assert.equal((await list('olu', '?q=zzzznothing')).body.entries.length, 0);
    assert.equal((await list('olu', '?entityType=bad')).status, 400); assert.equal((await list('olu', '?from=soon')).status, 400);
    assert.equal((await list('olu', '?from=2999-01-01')).body.entries.length, 0);
  });

  test('another workspace’s activity never appears, and the CSV export has a header and safe cells', async () => {
    const other = await t.workspace('out', 'Other'); await t.call('out', 'POST', `/workspaces/${other.id}/tasks`, { title: 'Secret task' });
    assert.equal((await list('olu', '?q=Secret')).body.entries.length, 0);
    await t.call('olu', 'POST', `/workspaces/${W.id}/tasks`, { title: '=HYPERLINK("http://evil.test")' });
    const response = await get('olu', '/export?entityType=TASK'); assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/csv/); assert.match(response.headers.get('content-disposition'), /aven-audit-log\.csv/);
    const csv = await response.text(); assert.match(csv, /^When \(UTC\),Person/); assert.equal(csv.includes('Secret'), false);
    assert.ok(csv.split('\r\n').length > 2); assert.ok(!/(^|,)=HYPERLINK/m.test(csv), 'a formula is not left to run');
  });
});
