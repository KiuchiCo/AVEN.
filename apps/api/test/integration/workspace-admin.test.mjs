import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('workspace administration', { skip }, () => {
  let t; let W;
  const base = () => `/workspaces/${W.id}`;
  const ids = {};
  before(async () => {
    t = await boot();
    for (const n of ['own', 'adm', 'adm2', 'mgr', 'mem', 'gst', 'out']) ids[n] = (await t.user(n)).id;
    W = await t.workspace('own');
    for (const [n, role] of [['adm', 'ADMINISTRATOR'], ['adm2', 'ADMINISTRATOR'], ['mgr', 'MANAGER'], ['mem', 'MEMBER'], ['gst', 'GUEST']]) await t.member(W.id, n, role);
    await t.plan(W.id, 'ENTERPRISE');
  });
  after(async () => { await t?.close(); });
  const role = async (n) => (await t.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: W.id, userId: ids[n] } } }))?.role ?? null;
  const patch = (who, n, body) => t.call(who, 'PATCH', `${base()}/members/${ids[n]}`, body);

  test('administrators manage managers, members and guests, but not administrators or the owner', async () => {
    assert.equal((await patch('adm', 'mem', { role: 'MANAGER' })).status, 200); assert.equal(await role('mem'), 'MANAGER');
    assert.equal((await patch('adm', 'mem', { role: 'ADMINISTRATOR' })).status, 403, 'cannot create administrators');
    assert.equal((await patch('adm', 'adm2', { role: 'MEMBER' })).status, 403);
    assert.equal((await patch('adm', 'own', { role: 'MEMBER' })).status, 400);
    assert.equal((await patch('mgr', 'gst', { role: 'MEMBER' })).status, 403, 'managers cannot manage people');
    assert.equal((await patch('own', 'adm2', { role: 'MEMBER' })).status, 200, 'the owner can'); await t.member(W.id, 'adm2', 'ADMINISTRATOR');
    await patch('adm', 'mem', { role: 'MEMBER' });
    assert.equal((await t.call('adm', 'DELETE', `${base()}/members/${ids.adm2}`)).status, 403);
    assert.equal((await t.call('mem', 'DELETE', `${base()}/members/${ids.gst}`)).status, 403);
    assert.equal((await t.call('adm', 'DELETE', `${base()}/members/${ids.own}`)).status, 400);
  });

  test('removing someone, or their leaving, unassigns their tasks', async () => {
    const task = (await t.call('own', 'POST', `${base()}/tasks`, { title: 'Handover', assigneeId: ids.mem })).body;
    assert.equal(task.assigneeId, ids.mem);
    assert.equal((await t.call('adm', 'DELETE', `${base()}/members/${ids.mem}`)).status, 200);
    assert.equal((await t.prisma.task.findUniqueOrThrow({ where: { id: task.id } })).assigneeId, null);
    await t.member(W.id, 'mem', 'MEMBER');
    const second = (await t.call('own', 'POST', `${base()}/tasks`, { title: 'Leaving', assigneeId: ids.mem })).body;
    assert.equal((await t.call('mem', 'POST', `${base()}/members/leave`)).status, 201);
    assert.equal((await t.prisma.task.findUniqueOrThrow({ where: { id: second.id } })).assigneeId, null);
    await t.member(W.id, 'mem', 'MEMBER');
  });

  test('anyone but the owner can leave, and the owner cannot', async () => {
    assert.equal((await t.call('own', 'POST', `${base()}/members/leave`)).status, 400);
    assert.equal((await t.call('out', 'POST', `${base()}/members/leave`)).status, 404, 'outsiders cannot');
    assert.equal((await t.call('gst', 'POST', `${base()}/members/leave`)).status, 201);
    assert.equal(await role('gst'), null); assert.equal((await t.call('gst', 'GET', `${base()}/projects`)).status, 404);
    const activity = await t.prisma.workspaceActivity.findFirst({ where: { workspaceId: W.id, message: { contains: 'left the workspace' } } });
    assert.ok(activity);
  });

  test('ownership can be transferred to a member who is not a guest, and the old owner becomes an administrator', async () => {
    assert.equal((await t.call('adm', 'POST', `${base()}/members/${ids.mgr}/make-owner`)).status, 403);
    assert.equal((await t.call('own', 'POST', `${base()}/members/${ids.own}/make-owner`)).status, 400);
    await t.member(W.id, 'gst', 'GUEST');
    assert.equal((await t.call('own', 'POST', `${base()}/members/${ids.gst}/make-owner`)).status, 400, 'guests cannot own');
    assert.equal((await t.call('own', 'POST', `${base()}/members/${ids.out}/make-owner`)).status, 404, 'non-members cannot own');
    assert.equal((await t.call('own', 'POST', `${base()}/members/${ids.mgr}/make-owner`)).status, 201);
    assert.deepEqual([await role('mgr'), await role('own')], ['OWNER', 'ADMINISTRATOR']);
    assert.equal(await t.prisma.workspaceMember.count({ where: { workspaceId: W.id, role: 'OWNER' } }), 1);
    assert.equal((await t.call('own', 'POST', `${base()}/members/${ids.adm}/make-owner`)).status, 403, 'the former owner no longer can');
    await t.prisma.workspace.update({ where: { id: W.id }, data: { personalOwnerId: ids.mgr } });
    assert.equal((await t.call('mgr', 'POST', `${base()}/members/${ids.mem}/make-owner`)).status, 400, 'personal workspaces cannot be transferred');
    await t.prisma.workspace.update({ where: { id: W.id }, data: { personalOwnerId: null } });
  });

  test('deleting a workspace needs the owner, the exact name, and no paid subscription; then everything is gone', async () => {
    // mgr owns it now
    const del = (who, body) => t.call(who, 'DELETE', base(), body);
    const project = (await t.call('mgr', 'POST', `${base()}/projects`, { name: 'Doomed' })).body;
    const file = (await t.upload('mgr', W.id, Buffer.from('bye'), 'name=bye.txt', 'text/plain')).body;
    assert.equal((await del('adm', { name: W.name })).status, 403);
    assert.equal((await del('mgr', { name: 'wrong' })).status, 400);
    await t.prisma.subscription.update({ where: { workspaceId: W.id }, data: { providerSubscriptionId: `sub_${Date.now()}`, status: 'ACTIVE' } });
    assert.equal((await del('mgr', { name: W.name })).status, 409, 'cancel the subscription first');
    await t.prisma.subscription.update({ where: { workspaceId: W.id }, data: { status: 'CANCELED' } });
    await t.prisma.workspace.update({ where: { id: W.id }, data: { personalOwnerId: ids.mgr } });
    assert.equal((await del('mgr', { name: W.name })).status, 400, 'personal workspaces cannot be deleted');
    await t.prisma.workspace.update({ where: { id: W.id }, data: { personalOwnerId: null } });
    assert.equal((await del('mgr', { name: W.name })).status, 200);
    assert.equal(await t.prisma.workspace.count({ where: { id: W.id } }), 0);
    assert.equal(await t.prisma.project.count({ where: { id: project.id } }), 0);
    assert.equal(await t.prisma.storedFile.count({ where: { id: file.id } }), 0);
    assert.equal((await t.call('mgr', 'GET', `${base()}/projects`)).status, 404);
  });
});
