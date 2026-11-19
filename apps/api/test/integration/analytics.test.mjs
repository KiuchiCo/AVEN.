import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('analytics', { skip }, () => {
  let t; let W;
  const ws = () => `/workspaces/${W.id}`;
  before(async () => { t = await boot(); await t.user('ivy'); await t.user('jon'); await t.user('kai'); W = await t.workspace('ivy'); await t.member(W.id, 'jon', 'GUEST'); });
  after(async () => { await t?.close(); });

  test('analytics is a paid feature: the Free plan is told how to get it, and a Pro workspace gets numbers', async () => {
    const refused = await t.call('ivy', 'GET', `${ws()}/analytics`);
    assert.equal(refused.status, 402); assert.match(refused.body.message, /Analytics isn’t included in the Free plan/);
    await t.plan(W.id, 'PRO');
    for (const title of ['One', 'Two', 'Three']) await t.call('ivy', 'POST', `${ws()}/tasks`, { title, dueAt: '2020-01-01' });
    const tasks = (await t.call('ivy', 'GET', `${ws()}/tasks`)).body;
    assert.equal((await t.call('ivy', 'PATCH', `${ws()}/tasks/${tasks[0].id}`, { status: 'COMPLETED' })).status, 200);
    const a = await t.call('ivy', 'GET', `${ws()}/analytics?days=7`);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(a.body.daily.length, 7); assert.equal(a.body.totals.created, 3); assert.equal(a.body.totals.completed, 1);
    assert.equal(a.body.totals.open, 2); assert.equal(a.body.totals.overdue, 2);
    assert.equal(a.body.workload[0].name, 'Unassigned'); assert.equal(a.body.workload[0].open, 2);
    assert.equal(a.body.cycleDays.count, 1);
  });

  test('guests can read it, outsiders cannot, and only known windows are allowed', async () => {
    assert.equal((await t.call('jon', 'GET', `${ws()}/analytics`)).status, 200);
    assert.equal((await t.call('kai', 'GET', `${ws()}/analytics`)).status, 404);
    assert.equal((await t.call('ivy', 'GET', `${ws()}/analytics?days=45`)).status, 400);
    assert.equal((await t.call('ivy', 'GET', `${ws()}/analytics?days=abc`)).status, 400);
  });

  test('downgrading to Free closes it again without touching any data', async () => {
    await t.prisma.subscription.update({ where: { workspaceId: W.id }, data: { status: 'CANCELED' } });
    assert.equal((await t.call('ivy', 'GET', `${ws()}/analytics`)).status, 402);
    assert.equal((await t.call('ivy', 'GET', `${ws()}/tasks`)).body.length, 3);
  });
});
