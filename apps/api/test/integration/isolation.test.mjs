import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('workspace isolation and guest access', { skip }, () => {
  let t; let A; let B; let ids;
  const ws = (workspace) => `/workspaces/${workspace.id}`;
  // A 404 only counts if the resource was hidden, not if the route doesn't exist (Nest says "Cannot GET …" then).
  const hidden = (r, label) => assert.ok(r.status === 404 && !/^Cannot /.test(r.body?.message ?? ''), `${label}: expected a hidden resource, got ${r.status} ${r.body?.message}`);

  before(async () => {
    t = await boot();
    for (const name of ['alice', 'bob', 'gina', 'mallory']) await t.user(name);
    A = await t.workspace('alice', 'Alpha'); B = await t.workspace('mallory', 'Bravo');
    await t.member(A.id, 'bob', 'MEMBER'); await t.member(A.id, 'gina', 'GUEST');
    const made = async (path, body) => { const r = await t.call('alice', 'POST', `${ws(A)}${path}`, body); assert.ok(r.status < 300, `${path}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
    const project = await made('/projects', { name: 'Secret project' });
    const task = await made('/tasks', { title: 'Secret task', projectId: project.id });
    const document = await made('/documents', { title: 'Secret document', content: 'hidden' });
    const event = await made('/events', { title: 'Secret event', startsAt: '2027-01-05T10:00:00Z' });
    const database = await made('/databases', { name: 'Secret database' });
    const knowledge = await made('/knowledge', { title: 'Secret note', content: 'hidden' });
    const workflow = await made('/workflows', { name: 'Secret workflow', trigger: { type: 'manual' }, steps: [{ id: 's1', type: 'notify', message: 'x', recipients: 'creator' }] });
    const file = (await t.upload('alice', A.id, Buffer.from('secret bytes'), 'name=secret.txt', 'text/plain')).body;
    const conversation = await made('/ai/conversations', {});
    const record = await made(`/databases/${database.id}/records`, { values: { name: 'Secret record' } });
    ids = { project, task, document, event, database, record, knowledge, workflow, file, conversation };
  });
  after(async () => { await t?.close(); });

  test('people who are not members cannot read or change anything in a workspace', async () => {
    for (const path of ['/tasks', '/projects', '/documents', '/events', '/databases', '/knowledge', '/files', '/workflows', '/ai/conversations', '/dashboard', '/activity']) {
      const r = await t.call('mallory', 'GET', `${ws(A)}${path}`);
      hidden(r, `GET ${path}`);
    }
    hidden(await t.call('mallory', 'POST', `${ws(A)}/tasks`, { title: 'Injected' }), 'POST /tasks');
    hidden(await t.call('mallory', 'POST', `${ws(A)}/workflows`, { name: 'x', trigger: { type: 'manual' }, steps: [{ id: 's1', type: 'notify', message: 'x', recipients: 'creator' }] }), 'POST /workflows');
    hidden(await t.upload('mallory', A.id, Buffer.from('x'), 'name=x.txt'), 'upload');
  });

  test('resource ids from one workspace do not work through another workspace’s URL', async () => {
    const attempts = [
      ['GET', `/documents/${ids.document.id}`], ['PATCH', `/documents/${ids.document.id}`, { title: 'Hijacked', baseUpdatedAt: new Date().toISOString() }], ['DELETE', `/documents/${ids.document.id}`],
      ['PATCH', `/tasks/${ids.task.id}`, { title: 'Hijacked' }], ['DELETE', `/tasks/${ids.task.id}`],
      ['PATCH', `/events/${ids.event.id}`, { title: 'Hijacked', baseUpdatedAt: new Date().toISOString() }], ['DELETE', `/events/${ids.event.id}`],
      ['GET', `/knowledge/${ids.knowledge.id}/links`], ['PATCH', `/knowledge/${ids.knowledge.id}`, { title: 'Hijacked' }],
      ['GET', `/files/${ids.file.id}/download`], ['DELETE', `/files/${ids.file.id}`], ['GET', `/files/${ids.file.id}/versions`],
      ['GET', `/workflows/${ids.workflow.id}`], ['POST', `/workflows/${ids.workflow.id}/run`, {}], ['DELETE', `/workflows/${ids.workflow.id}`],
      ['GET', `/ai/conversations/${ids.conversation.id}`], ['DELETE', `/ai/conversations/${ids.conversation.id}`],
      ['PATCH', `/projects/${ids.project.id}`, { name: 'Hijacked' }],
      ['PATCH', `/databases/${ids.database.id}`, { name: 'Hijacked' }], ['PATCH', `/databases/${ids.database.id}/records/${ids.record.id}`, { values: { name: 'Hijacked' }, baseUpdatedAt: new Date().toISOString() }],
      ['DELETE', `/databases/${ids.database.id}/records/${ids.record.id}`], ['POST', `/databases/${ids.database.id}/records`, { values: { name: 'Injected' } }],
      ['POST', `/databases/${ids.database.id}/records/bulk-delete`, { recordIds: [ids.record.id] }],
      ['POST', `/tasks/${ids.task.id}/duplicate`, {}], ['PUT', `/tasks/${ids.task.id}/dependencies`, { dependsOnTaskIds: [] }],
    ];
    for (const [method, path, body] of attempts) hidden(await t.call('mallory', method, `${ws(B)}${path}`, body), `${method} ${path}`);
    const [task, document, event, knowledge, file, workflow, project, record] = await Promise.all([
      t.prisma.task.findUnique({ where: { id: ids.task.id } }), t.prisma.document.findUnique({ where: { id: ids.document.id } }), t.prisma.calendarEvent.findUnique({ where: { id: ids.event.id } }),
      t.prisma.knowledgeItem.findUnique({ where: { id: ids.knowledge.id } }), t.prisma.storedFile.findUnique({ where: { id: ids.file.id } }), t.prisma.workflow.findUnique({ where: { id: ids.workflow.id } }), t.prisma.project.findUnique({ where: { id: ids.project.id } }), t.prisma.databaseRecord.findUnique({ where: { id: ids.record.id } }),
    ]);
    assert.deepEqual([task?.title, document?.title, event?.title, knowledge?.title, file?.deletedAt, workflow?.name, project?.name, (record?.values)?.name], ['Secret task', 'Secret document', 'Secret event', 'Secret note', null, 'Secret workflow', 'Secret project', 'Secret record']);
    assert.equal(await t.prisma.databaseRecord.count({ where: { databaseId: ids.database.id } }), 1, 'nothing was injected');
  });

  test('guests can read everything but change nothing', async () => {
    for (const path of ['/tasks', '/projects', '/documents', '/events', '/databases', '/knowledge', '/files', '/workflows', '/dashboard']) {
      assert.equal((await t.call('gina', 'GET', `${ws(A)}${path}`)).status, 200, `guest GET ${path}`);
    }
    const writes = [
      ['POST', '/projects', { name: 'x' }], ['PATCH', `/projects/${ids.project.id}`, { name: 'x' }],
      ['POST', '/tasks', { title: 'x' }], ['PATCH', `/tasks/${ids.task.id}`, { status: 'COMPLETED' }], ['DELETE', `/tasks/${ids.task.id}`],
      ['POST', '/documents', { title: 'x', content: 'x' }], ['PATCH', `/documents/${ids.document.id}`, { title: 'x', baseUpdatedAt: new Date().toISOString() }], ['DELETE', `/documents/${ids.document.id}`],
      ['POST', '/events', { title: 'x', startsAt: '2027-01-05T10:00:00Z' }], ['DELETE', `/events/${ids.event.id}`],
      ['POST', '/databases', { name: 'x' }], ['PATCH', `/databases/${ids.database.id}`, { name: 'x' }], ['POST', `/databases/${ids.database.id}/records`, { values: { name: 'x' } }], ['DELETE', `/databases/${ids.database.id}/records/${ids.record.id}`], ['POST', `/databases/${ids.database.id}/records/bulk-delete`, { recordIds: [ids.record.id] }], ['POST', '/knowledge', { title: 'x', content: 'x' }], ['PATCH', `/knowledge/${ids.knowledge.id}`, { title: 'x' }],
      ['POST', '/files/folders', { name: 'x' }], ['DELETE', `/files/${ids.file.id}`],
      ['POST', '/workflows', { name: 'x', trigger: { type: 'manual' }, steps: [{ id: 's1', type: 'notify', message: 'x', recipients: 'creator' }] }], ['POST', `/workflows/${ids.workflow.id}/run`, {}], ['DELETE', `/workflows/${ids.workflow.id}`],
      ['POST', '/ai/agents', { name: 'x', description: '', instructions: 'x', tools: [] }],
    ];
    for (const [method, path, body] of writes) {
      const r = await t.call('gina', method, `${ws(A)}${path}`, body);
      assert.equal(r.status, 403, `guest ${method} ${path} should be 403, got ${r.status}`);
    }
    assert.equal((await t.upload('gina', A.id, Buffer.from('x'), 'name=g.txt')).status, 403);
    assert.equal(await t.prisma.databaseRecord.count({ where: { databaseId: ids.database.id } }), 1, 'the guest changed no records');
    assert.equal((await t.prisma.task.findUnique({ where: { id: ids.task.id } }))?.status, 'TODO', 'the guest changed nothing');
    assert.equal(await t.prisma.workflow.count({ where: { workspaceId: A.id } }), 1);
  });

  test('regular members can write, and requests without sign-in are refused', async () => {
    assert.equal((await t.call('bob', 'POST', `${ws(A)}/tasks`, { title: 'Bob task' })).status, 201);
    assert.equal((await t.call(null, 'GET', `${ws(A)}/tasks`)).status, 401);
    assert.equal((await t.call('bob', 'GET', '/workspaces/not-a-uuid/tasks')).status, 400);
  });
});
