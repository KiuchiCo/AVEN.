import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('project workspace: owner, team, visibility, milestones and deletion', { skip }, () => {
  let t; let W; let ws; const U = {};
  before(async () => {
    t = await boot();
    for (const name of ['own', 'adm', 'mem', 'mem2', 'out', 'gst']) U[name] = await t.user(name);
    W = await t.workspace('own'); ws = `/workspaces/${W.id}`;
    await t.plan(W.id, 'PRO'); await t.member(W.id, 'adm', 'ADMINISTRATOR'); await t.member(W.id, 'mem', 'MEMBER'); await t.member(W.id, 'mem2', 'MEMBER'); await t.member(W.id, 'gst', 'GUEST');
  });
  after(async () => { await t?.close(); });

  test('a project starts with an owner, a start date and task progress', async () => {
    const created = await t.call('mem', 'POST', `${ws}/projects`, { name: 'Site', startAt: '2026-01-05', dueAt: '2026-03-01' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.ownerId, created.body.createdById); assert.equal(created.body.visibility, 'WORKSPACE');
    assert.equal((await t.call('mem', 'POST', `${ws}/projects`, { name: 'Bad', startAt: '2026-04-01', dueAt: '2026-03-01' })).status, 400);
    const task = (await t.call('mem', 'POST', `${ws}/tasks`, { title: 'A', projectId: created.body.id })).body;
    await t.call('mem', 'POST', `${ws}/tasks`, { title: 'B', projectId: created.body.id });
    await t.call('mem', 'PATCH', `${ws}/tasks/${task.id}`, { status: 'COMPLETED' });
    const one = await t.call('mem', 'GET', `${ws}/projects/${created.body.id}`);
    assert.equal(one.status, 200); assert.equal(one.body.taskCount, 2); assert.equal(one.body.completedCount, 1);
    assert.equal(one.body.owner.displayName, 'mem'); assert.equal(one.body.canAdminister, true);
    const listed = (await t.call('mem', 'GET', `${ws}/projects`)).body.find((p) => p.id === created.body.id);
    assert.equal(listed.completedCount, 1); assert.equal(listed.owner.id, created.body.ownerId);
  });

  test('only a non-guest workspace member can own a project, and only the owner or an administrator changes it', async () => {
    const p = (await t.call('mem', 'POST', `${ws}/projects`, { name: 'Owned' })).body;
    assert.equal((await t.call('mem', 'PATCH', `${ws}/projects/${p.id}`, { ownerId: U.gst.id })).status, 400, 'a guest cannot own');
    assert.equal((await t.call('mem', 'PATCH', `${ws}/projects/${p.id}`, { ownerId: U.out.id })).status, 400, 'a non-member cannot own');
    const admin = U.adm;
    assert.equal((await t.call('mem', 'PATCH', `${ws}/projects/${p.id}`, { ownerId: admin.id })).status, 200);
    assert.equal((await t.call('mem2', 'PATCH', `${ws}/projects/${p.id}`, { visibility: 'TEAM' })).status, 403, 'a member who neither owns nor created it cannot change visibility');
    assert.equal((await t.call('mem', 'PATCH', `${ws}/projects/${p.id}`, { visibility: 'WORKSPACE' })).status, 200, 'its creator still can');
    assert.equal((await t.call('adm', 'PATCH', `${ws}/projects/${p.id}`, { visibility: 'TEAM' })).status, 200);
  });

  test('a team-only project is hidden from people who are not on it, and showing it again is a team choice', async () => {
    const p = (await t.call('own', 'POST', `${ws}/projects`, { name: 'Secret', visibility: 'TEAM' })).body;
    const task = (await t.call('own', 'POST', `${ws}/tasks`, { title: 'Hidden task', projectId: p.id })).body;
    assert.equal((await t.call('mem', 'GET', `${ws}/projects/${p.id}`)).status, 404);
    assert.equal((await t.call('mem', 'GET', `${ws}/projects/${p.id}/milestones`)).status, 404);
    assert.equal((await t.call('mem', 'GET', `${ws}/projects`)).body.some((x) => x.id === p.id), false);
    assert.equal((await t.call('mem', 'GET', `${ws}/tasks`)).body.some((x) => x.id === task.id), false);
    assert.equal((await t.call('adm', 'GET', `${ws}/projects/${p.id}`)).status, 200, 'administrators see everything');
    const mem = U.mem;
    assert.equal((await t.call('mem', 'POST', `${ws}/projects/${p.id}/team`, { userId: mem.id })).status, 404, 'cannot add yourself to what you cannot see');
    const team = await t.call('own', 'POST', `${ws}/projects/${p.id}/team`, { userId: mem.id });
    assert.equal(team.status, 201, JSON.stringify(team.body));
    assert.equal((await t.call('mem', 'GET', `${ws}/projects/${p.id}`)).status, 200);
    assert.equal((await t.call('mem', 'GET', `${ws}/tasks`)).body.some((x) => x.id === task.id), true);
  });

  test('team members can be added once, never duplicated, and the owner cannot be removed', async () => {
    const p = (await t.call('own', 'POST', `${ws}/projects`, { name: 'Crew' })).body;
    const mem = U.mem; const own = U.own;
    await t.call('own', 'POST', `${ws}/projects/${p.id}/team`, { userId: mem.id });
    const again = await t.call('own', 'POST', `${ws}/projects/${p.id}/team`, { userId: mem.id });
    assert.equal(again.body.filter((m) => m.userId === mem.id).length, 1);
    assert.equal(again.body[0].isOwner, true);
    assert.equal((await t.call('own', 'POST', `${ws}/projects/${p.id}/team`, { userId: U.out.id })).status, 400, 'people outside the workspace cannot join');
    assert.equal((await t.call('mem', 'DELETE', `${ws}/projects/${p.id}/team/${mem.id}`)).status, 403, 'a plain member cannot change the team');
    assert.equal((await t.call('own', 'DELETE', `${ws}/projects/${p.id}/team/${own.id}`)).status, 409);
    assert.equal((await t.call('own', 'DELETE', `${ws}/projects/${p.id}/team/${mem.id}`)).status, 200);
    assert.equal(await t.prisma.workspaceMember.count({ where: { workspaceId: W.id } }), 5, 'workspace membership is untouched');
  });

  test('milestones keep a description and the tasks assigned to them, and progress follows those tasks', async () => {
    const p = (await t.call('own', 'POST', `${ws}/projects`, { name: 'Roadmap' })).body; const other = (await t.call('own', 'POST', `${ws}/projects`, { name: 'Elsewhere' })).body;
    const m = (await t.call('own', 'POST', `${ws}/projects/${p.id}/milestones`, { title: 'Beta', description: 'Ready for testers', dueAt: '2026-06-01' })).body;
    const foreign = (await t.call('own', 'POST', `${ws}/projects/${other.id}/milestones`, { title: 'Other' })).body;
    assert.equal((await t.call('own', 'POST', `${ws}/tasks`, { title: 'Wrong', projectId: p.id, milestoneId: foreign.id })).status, 400, 'a milestone of another project is refused');
    const a = (await t.call('own', 'POST', `${ws}/tasks`, { title: 'Ship', projectId: p.id, milestoneId: m.id })).body;
    await t.call('own', 'POST', `${ws}/tasks`, { title: 'Polish', projectId: p.id, milestoneId: m.id });
    await t.call('own', 'PATCH', `${ws}/tasks/${a.id}`, { status: 'COMPLETED' });
    const rows = (await t.call('own', 'GET', `${ws}/projects/${p.id}/milestones`)).body;
    assert.equal(rows[0].description, 'Ready for testers'); assert.equal(rows[0].taskCount, 2); assert.equal(rows[0].completedCount, 1);
    assert.equal((await t.call('own', 'GET', `${ws}/tasks`)).body.find((x) => x.id === a.id).milestone.title, 'Beta');
    assert.equal((await t.call('own', 'PATCH', `${ws}/tasks/${a.id}`, { milestoneId: foreign.id })).status, 400);
    assert.equal((await t.call('own', 'PATCH', `${ws}/tasks/${a.id}`, { milestoneId: null })).status, 200);
    await t.call('own', 'DELETE', `${ws}/projects/${p.id}/milestones/${m.id}`);
    assert.equal((await t.prisma.task.count({ where: { projectId: p.id, milestoneId: null } })), 2, 'deleting a milestone keeps its tasks');
  });

  test('deleting a project removes it and its milestones and team but keeps its tasks, and needs the owner or an administrator', async () => {
    const p = (await t.call('mem', 'POST', `${ws}/projects`, { name: 'Doomed' })).body;
    const task = (await t.call('mem', 'POST', `${ws}/tasks`, { title: 'Keep me', projectId: p.id })).body;
    assert.equal((await t.call('gst', 'DELETE', `${ws}/projects/${p.id}`)).status, 403);
    assert.equal((await t.call('out', 'DELETE', `${ws}/projects/${p.id}`)).status, 404);
    assert.equal((await t.call('mem', 'DELETE', `${ws}/projects/${p.id}`)).status, 200);
    assert.equal((await t.call('mem', 'GET', `${ws}/projects/${p.id}`)).status, 404);
    assert.equal((await t.prisma.task.findUnique({ where: { id: task.id } })).projectId, null);
  });

  test('a template can start a project with its own owner, description and dates', async () => {
    const tpl = (await t.call('own', 'POST', `${ws}/projects/project-templates`, { name: 'Kit', description: 'From kit', taskTemplates: [], milestoneTemplates: [] })).body;
    const adm = U.adm;
    const made = await t.call('own', 'POST', `${ws}/projects/project-templates/${tpl.id}/apply`, { name: 'From kit', description: 'Mine', ownerId: adm.id, startAt: '2026-02-01', dueAt: '2026-05-01' });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal(made.body.description, 'Mine'); assert.equal(made.body.ownerId, adm.id); assert.equal(made.body.startAt.slice(0, 10), '2026-02-01');
    assert.equal((await t.call('own', 'POST', `${ws}/projects/project-templates/${tpl.id}/apply`, { name: 'x', startAt: '2026-06-01', dueAt: '2026-05-01' })).status, 400);
  });

  test('security: the tasks of a team-only project are as hidden as the project (detail, change, delete, comments, search, dashboard)', async () => {
    const p = (await t.call('mem', 'POST', `${ws}/projects`, { name: 'Secret roadmap' })).body;
    const task = (await t.call('mem', 'POST', `${ws}/tasks`, { title: 'Quietly acquire Acme', projectId: p.id })).body;
    assert.equal((await t.call('mem', 'PATCH', `${ws}/projects/${p.id}`, { visibility: 'TEAM' })).status, 200);
    const seen = (route) => t.call('mem2', 'GET', `${ws}${route}`);
    assert.equal((await seen(`/tasks/${task.id}/collaboration/task`)).status, 404, 'detail');
    assert.equal((await seen(`/tasks/${task.id}/collaboration/comments`)).status, 404, 'comments');
    assert.equal((await t.call('mem2', 'POST', `${ws}/tasks/${task.id}/collaboration/comments`, { body: 'hi' })).status, 404, 'commenting');
    assert.equal((await t.call('mem2', 'PATCH', `${ws}/tasks/${task.id}`, { status: 'COMPLETED' })).status, 404, 'changing');
    assert.equal((await t.call('mem2', 'DELETE', `${ws}/tasks/${task.id}`)).status, 404, 'deleting');
    assert.equal((await t.call('mem2', 'POST', `${ws}/tasks/${task.id}/duplicate`)).status, 404, 'duplicating');
    const listed = (await seen('/tasks')).body; assert.ok(!listed.some((row) => row.id === task.id), 'task list');
    const found = JSON.stringify((await seen('/search?q=Acme')).body.results); assert.ok(!found.includes('Acme') && !found.includes('Secret roadmap'), 'search');
    assert.ok(JSON.stringify((await t.call('mem', 'GET', `${ws}/search?q=Acme`)).body.results).includes('Acme'), 'the owner still finds it');
    const dash = JSON.stringify((await seen('/dashboard')).body); assert.ok(!dash.includes('Secret roadmap'), 'dashboard');
    const feed = JSON.stringify((await seen('/activity')).body); assert.ok(!feed.includes('Secret roadmap') && !feed.includes('Acme'), 'activity feed');
    const inbox = JSON.stringify((await seen('/activity/inbox')).body); assert.ok(!inbox.includes('Secret roadmap') && !inbox.includes('Acme'), 'notifications');
    // the creator and an administrator still can
    assert.equal((await t.call('mem', 'GET', `${ws}/tasks/${task.id}/collaboration/task`)).status, 200);
    assert.equal((await t.call('adm', 'GET', `${ws}/tasks/${task.id}/collaboration/task`)).status, 200);
    assert.equal((await t.call('mem', 'PATCH', `${ws}/tasks/${task.id}`, { status: 'IN_PROGRESS' })).status, 200);
  });
});
