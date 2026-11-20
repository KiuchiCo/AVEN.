import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('task start dates in bulk edit and templates', { skip }, () => {
  let t; let W; let tasks;
  const day = (offset) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + offset));
  before(async () => {
    t = await boot(); await t.user('sol');
    W = await t.workspace('sol');
    tasks = [];
    for (const title of ['One', 'Two']) tasks.push((await t.call('sol', 'POST', `/workspaces/${W.id}/tasks`, { title, dueAt: day(10).toISOString() })).body);
  });
  after(async () => { await t?.close(); });
  const all = async () => (await t.call('sol', 'GET', `/workspaces/${W.id}/tasks`)).body;
  const get = async (id) => (await all()).find((x) => x.id === id);

  test('bulk edit sets and clears start dates, and refuses a start after the due date', async () => {
    const taskIds = tasks.map((x) => x.id);
    const set = await t.call('sol', 'PATCH', `/workspaces/${W.id}/tasks/bulk`, { taskIds, startAt: day(3).toISOString() });
    assert.equal(set.status, 200); assert.equal(set.body.updated, 2);
    assert.equal(new Date((await get(taskIds[0])).startAt).getTime(), day(3).getTime());
    assert.equal((await t.call('sol', 'PATCH', `/workspaces/${W.id}/tasks/bulk`, { taskIds, startAt: day(20).toISOString() })).status, 400);
    assert.equal((await t.call('sol', 'PATCH', `/workspaces/${W.id}/tasks/bulk`, { taskIds, startAt: null })).status, 200);
    assert.equal((await get(taskIds[1])).startAt, null);
  });

  test('a project saved as a template keeps start offsets, and applying it recreates them', async () => {
    const project = (await t.call('sol', 'POST', `/workspaces/${W.id}/projects`, { name: 'Launch' })).body;
    await t.call('sol', 'POST', `/workspaces/${W.id}/tasks`, { title: 'Build', projectId: project.id, startAt: day(2).toISOString(), dueAt: day(9).toISOString() });
    const tpl = await t.call('sol', 'POST', `/workspaces/${W.id}/projects/${project.id}/template`, { name: 'Launch kit' });
    assert.equal(tpl.status, 201, JSON.stringify(tpl.body));
    assert.equal(tpl.body.taskTemplates[0].startDaysFromToday, 2);
    const applied = await t.call('sol', 'POST', `/workspaces/${W.id}/projects/project-templates/${tpl.body.id}/apply`, { name: 'Launch 2' });
    assert.equal(applied.status, 201, JSON.stringify(applied.body));
    const copy = (await all()).find((x) => x.projectId === applied.body.id);
    assert.equal(new Date(copy.startAt).getTime(), day(2).getTime());
  });
});
