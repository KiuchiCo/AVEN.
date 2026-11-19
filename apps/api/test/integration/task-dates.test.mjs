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

  test('duplicating copies the start date, and CSV import sets, keeps and checks it', async () => {
    const task = (await t.call('tia', 'POST', `${ws()}/tasks`, { title: 'Original', startAt: '2026-04-01', dueAt: '2026-04-09' })).body;
    const copy = await t.call('tia', 'POST', `${ws()}/tasks/${task.id}/duplicate`);
    assert.equal(copy.status, 201); assert.ok(copy.body.startAt.startsWith('2026-04-01'));
    const row = (extra) => ({ title: 'Imported', status: 'TODO', priority: 'LOW', labels: [], ...extra });
    const created = await t.call('tia', 'POST', `${ws()}/tasks/import`, { mode: 'CREATE', tasks: [row({ startAt: '2026-05-01', dueAt: '2026-05-03' }), row({ title: 'No start', dueAt: '2026-05-03' })] });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const all = (await t.call('tia', 'GET', `${ws()}/tasks`)).body;
    assert.ok(all.find((x) => x.title === 'Imported').startAt.startsWith('2026-05-01')); assert.equal(all.find((x) => x.title === 'No start').startAt, null);
    const full = (extra) => ({ id: task.id, title: 'Original', description: null, status: 'TODO', priority: 'MEDIUM', labels: [], projectId: null, assigneeId: null, dueAt: '2026-04-09', ...extra });
    const keep = await t.call('tia', 'POST', `${ws()}/tasks/import`, { mode: 'UPSERT', tasks: [full({ priority: 'HIGH' })] });
    assert.equal(keep.status, 201, JSON.stringify(keep.body));
    assert.ok((await t.call('tia', 'GET', `${ws()}/tasks`)).body.find((x) => x.id === task.id).startAt.startsWith('2026-04-01'), 'no start column leaves the stored date');
    const bad = await t.call('tia', 'POST', `${ws()}/tasks/import`, { mode: 'UPSERT', tasks: [full({ dueAt: '2026-03-01' })] });
    assert.equal(bad.status, 400, 'a due date before the stored start is refused');
    assert.equal((await t.call('tia', 'POST', `${ws()}/tasks/import`, { mode: 'CREATE', tasks: [row({ startAt: '2026-06-09', dueAt: '2026-06-01' })] })).status, 400);
  });
});

