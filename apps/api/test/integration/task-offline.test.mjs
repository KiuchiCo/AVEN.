import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('task edits made offline are applied only to fields nobody else changed', { skip }, () => {
  let t; let W;
  const ws = () => `/workspaces/${W.id}`;
  before(async () => { t = await boot(); await t.user('olga'); await t.user('ivan'); W = await t.workspace('olga'); await t.member(W.id, 'ivan', 'MEMBER'); });
  after(async () => { await t?.close(); });

  test('an edit whose base still matches is applied; edits without a base behave as before', async () => {
    const task = (await t.call('olga', 'POST', `${ws()}/tasks`, { title: 'Draft', priority: 'LOW', labels: ['a', 'b'] })).body;
    const ok = await t.call('olga', 'PATCH', `${ws()}/tasks/${task.id}`, { status: 'IN_PROGRESS', priority: 'HIGH', base: { status: 'TODO', priority: 'LOW' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.equal(ok.body.priority, 'HIGH');
    assert.equal((await t.call('olga', 'PATCH', `${ws()}/tasks/${task.id}`, { labels: ['c'], base: { labels: ['a', 'b'] } })).status, 200);
    assert.equal((await t.call('olga', 'PATCH', `${ws()}/tasks/${task.id}`, { title: 'Plain edit' })).status, 200);
  });

  test('a field someone else changed meanwhile is a conflict that applies nothing and shows the current task', async () => {
    const task = (await t.call('olga', 'POST', `${ws()}/tasks`, { title: 'Shared', priority: 'LOW' })).body;
    await t.call('ivan', 'PATCH', `${ws()}/tasks/${task.id}`, { priority: 'URGENT' });
    const stale = await t.call('olga', 'PATCH', `${ws()}/tasks/${task.id}`, { priority: 'MEDIUM', status: 'COMPLETED', base: { priority: 'LOW', status: 'TODO' } });
    assert.equal(stale.status, 409); assert.deepEqual(stale.body.fields.sort(), ['priority', 'status']);
    assert.equal(stale.body.current.priority, 'URGENT'); assert.equal(stale.body.current.id, task.id);
    const after = (await t.call('olga', 'GET', `${ws()}/tasks`)).body.find((row) => row.id === task.id);
    assert.equal(after.priority, 'URGENT'); assert.equal(after.status, 'TODO', 'the unconflicted field was not applied either');
    // Re-sent against what is there now, it goes through.
    assert.equal((await t.call('olga', 'PATCH', `${ws()}/tasks/${task.id}`, { priority: 'MEDIUM', base: { priority: 'URGENT' } })).status, 200);
  });

  test('a different field changed by someone else does not block the edit', async () => {
    const task = (await t.call('olga', 'POST', `${ws()}/tasks`, { title: 'Split', priority: 'LOW' })).body;
    await t.call('ivan', 'PATCH', `${ws()}/tasks/${task.id}`, { title: 'Renamed by Ivan' });
    const done = await t.call('olga', 'PATCH', `${ws()}/tasks/${task.id}`, { priority: 'HIGH', base: { priority: 'LOW' } });
    assert.equal(done.status, 200); assert.equal(done.body.title, 'Renamed by Ivan'); assert.equal(done.body.priority, 'HIGH');
  });

  test('a base that names fields not being changed, or bad values, is refused; deleted tasks are 404', async () => {
    const task = (await t.call('olga', 'POST', `${ws()}/tasks`, { title: 'Strict' })).body;
    assert.equal((await t.call('olga', 'PATCH', `${ws()}/tasks/${task.id}`, { priority: 'HIGH', base: { status: 'TODO' } })).status, 400);
    assert.equal((await t.call('olga', 'PATCH', `${ws()}/tasks/${task.id}`, { priority: 'HIGH', base: { priority: 'NOPE' } })).status, 400);
    assert.equal((await t.call('olga', 'PATCH', `${ws()}/tasks/${task.id}`, { priority: 'HIGH', base: 'x' })).status, 400);
    await t.call('olga', 'DELETE', `${ws()}/tasks/${task.id}`);
    assert.equal((await t.call('olga', 'PATCH', `${ws()}/tasks/${task.id}`, { priority: 'HIGH', base: { priority: 'MEDIUM' } })).status, 404);
  });
});
