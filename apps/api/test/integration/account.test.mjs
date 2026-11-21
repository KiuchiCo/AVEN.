import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('privacy: a person can get a copy of their data and delete their account', { skip }, () => {
  let t; let shared; let own; let email; const U = {};
  before(async () => {
    t = await boot();
    for (const name of ['pat', 'quinn', 'rob']) U[name] = await t.user(name);
    shared = await t.workspace('quinn', 'Shared'); own = await t.workspace('pat', 'Pat alone');
    await t.member(shared.id, 'pat', 'MEMBER'); await t.member(shared.id, 'rob', 'MEMBER');
    email = U.pat.email;
  });
  after(async () => { await t?.close(); });
  const ws = () => `/workspaces/${shared.id}`;

  test('the export holds what they wrote and what is about them, and nothing of other people’s or of secrets', async () => {
    const task = (await t.call('pat', 'POST', `${ws()}/tasks`, { title: 'Pat’s task', assigneeId: U.pat.id })).body;
    const doc = (await t.call('pat', 'POST', `${ws()}/documents`, { title: 'Pat’s notes', content: 'private thoughts' })).body;
    await t.call('rob', 'POST', `${ws()}/documents`, { title: 'Rob’s notes', content: 'rob secret' });
    await t.call('pat', 'POST', `${ws()}/tasks/${task.id}/collaboration/comments`, { body: 'a comment by pat' });
    const hiddenProject = (await t.call('quinn', 'POST', `${ws()}/projects`, { name: 'Quinn only', visibility: 'TEAM' })).body;
    await t.call('quinn', 'POST', `${ws()}/tasks`, { title: 'Hidden from Pat', projectId: hiddenProject.id, assigneeId: U.pat.id });
    const response = await t.call('pat', 'GET', '/session/export');
    assert.equal(response.status, 200);
    const data = JSON.stringify(response.body);
    assert.equal(response.body.profile.email, email);
    assert.ok(data.includes('Pat’s notes') && data.includes('private thoughts') && data.includes('a comment by pat') && data.includes('Pat’s task'));
    assert.ok(!data.includes('rob secret') && !data.includes('Hidden from Pat') && !data.includes('Quinn only'), 'nobody else’s content, and no hidden-project task');
    assert.ok(!/token|secret|password/i.test(Object.keys(response.body.profile).join()), 'no credentials in the profile');
    assert.equal((await fetch(`${t.base}/session/export`)).status, 401);
    assert.equal(doc.title, 'Pat’s notes');
  });

  test('deleting needs the email typed back, and is refused while they own a workspace with other people in it', async () => {
    assert.equal((await t.call('pat', 'POST', '/session/delete-account', {})).status, 400);
    assert.equal((await t.call('pat', 'POST', '/session/delete-account', { confirmEmail: 'someone@else.test' })).status, 400);
    assert.equal((await t.call('quinn', 'POST', '/session/delete-account', { confirmEmail: U.quinn.email })).status, 409, 'the owner of a shared workspace must hand it over first');
    assert.equal((await t.prisma.user.findUnique({ where: { id: U.pat.id } })).email, email, 'nothing was deleted');
  });

  test('deleting removes access at once, strips what identifies them, keeps shared work under "Deleted user", and deletes a workspace they own alone', async () => {
    const mine = (await t.call('pat', 'POST', `/workspaces/${own.id}/documents`, { title: 'Only Pat sees this', content: 'x' })).body;
    assert.equal(mine.title, 'Only Pat sees this');
    const response = await t.call('pat', 'POST', '/session/delete-account', { confirmEmail: email.toUpperCase() });
    assert.equal(response.status, 200, JSON.stringify(response.body)); assert.equal(response.body.workspacesDeleted, 1);
    for (const path of ['/session/me', `${ws()}/documents`, `/workspaces/${own.id}/documents`]) { const r = await t.call('pat', 'GET', path); assert.ok([401, 403, 404].includes(r.status), `${path} is closed to them: ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`); }
    const row = await t.prisma.user.findUnique({ where: { id: U.pat.id } });
    assert.equal(row.displayName, 'Deleted user'); assert.ok(row.email.endsWith('@deleted.invalid')); assert.equal(row.identitySubject, null);
    assert.equal(await t.prisma.workspaceMember.count({ where: { userId: row.id } }), 0);
    assert.equal(await t.prisma.workspace.count({ where: { id: own.id } }), 0, 'their own workspace is gone');
    assert.equal(await t.prisma.task.count({ where: { assigneeId: row.id } }), 0, 'their tasks are unassigned');
    assert.ok((await t.call('rob', 'GET', `${ws()}/documents`)).body.some((doc) => doc.title === 'Pat’s notes' && doc.createdBy.displayName === 'Deleted user'), 'the team keeps the work');
    assert.ok(!JSON.stringify(await t.prisma.workspaceMember.findMany({ where: { workspaceId: shared.id }, include: { user: true } })).includes(email), 'their address is nowhere in the workspace any more');
  });
});
