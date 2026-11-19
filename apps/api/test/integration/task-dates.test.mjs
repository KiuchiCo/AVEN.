import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('task start dates', { skip }, () => {
  let t; let W;
  const ws = () => `/workspaces/${W.id}`;
  before(async () => { t = await boot(); await t.user('tia'); W = await t.workspace('tia'); });
  after(async () => { await t?.close(); });

  test('start and due dates are stored, and the order is enforced on create and update', async () => {
    const made = await t.call('tia', 'POST', `${ws()}/tasks`, { title: 'Plan', startAt: '2026-03-02', dueAt: '2026-03-06' });
    assert.equal(made.status, 201); assert.ok(made.body.startAt.startsWith('2026-03-02'));
    assert.equal((await t.call('tia', 'POST', `${ws()}/tasks`, { title: 'Backwards', startAt: '2026-03-09', dueAt: '2026-03-06' })).status, 400);
    assert.equal((await t.call('tia', 'PATCH', `${ws()}/tasks/${made.body.id}`, { startAt: '2026-03-10' })).status, 400, 'a new start after the stored due date');
    assert.equal((await t.call('tia', 'PATCH', `${ws()}/tasks/${made.body.id}`, { dueAt: '2026-03-01' })).status, 400, 'a new due before the stored start');
    const moved = await t.call('tia', 'PATCH', `${ws()}/tasks/${made.body.id}`, { startAt: '2026-03-03', dueAt: '2026-03-12' });
    assert.equal(moved.status, 200); assert.ok(moved.body.startAt.startsWith('2026-03-03'));
    assert.equal((await t.call('tia', 'PATCH', `${ws()}/tasks/${made.body.id}`, { startAt: null })).body.startAt, null);
    assert.equal((await t.call('tia', 'PATCH', `${ws()}/tasks/${made.body.id}`, { startAt: 'someday' })).status, 400);
  });
});
