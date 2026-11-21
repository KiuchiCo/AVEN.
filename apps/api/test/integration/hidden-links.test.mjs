import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('security: what links to a team-only project does not give it away', { skip }, () => {
  let t; let W; let ws; let dir; let project; let task; let doc; let file; let note;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aven-hidden-'));
    t = await boot({ STORAGE_DIR: dir });
    for (const name of ['own', 'mem', 'out']) await t.user(name);
    await t.user('mem2');
    W = await t.workspace('own'); ws = `/workspaces/${W.id}`;
    await t.member(W.id, 'mem', 'MEMBER'); await t.member(W.id, 'mem2', 'MEMBER');
    project = (await t.call('mem', 'POST', `${ws}/projects`, { name: 'Project Nightingale' })).body;
    task = (await t.call('mem', 'POST', `${ws}/tasks`, { title: 'Nightingale task', projectId: project.id })).body;
    doc = (await t.call('mem', 'POST', `${ws}/documents`, { title: 'Brief', content: '', projectId: project.id })).body;
    file = (await t.upload('mem', W.id, Buffer.from('confidential'), 'name=terms.txt', 'text/plain')).body;
    assert.equal((await t.call('mem', 'POST', `${ws}/files/attachments`, { fileId: file.id, taskId: task.id })).status, 201);
    assert.equal((await t.call('mem', 'POST', `${ws}/files/attachments`, { fileId: file.id, projectId: project.id })).status, 201);
    note = (await t.call('mem', 'POST', `${ws}/knowledge`, { title: 'Notes', content: 'x', projectId: project.id, taskId: task.id })).body;
    assert.equal((await t.call('mem', 'PATCH', `${ws}/knowledge/${note.id}`, { content: 'changed' })).status, 200);
    assert.equal((await t.call('mem2', 'POST', `${ws}/favourites`, { kind: 'PROJECT', entityId: project.id })).status, 200, 'pinned while visible');
    await t.call('mem', 'POST', `${ws}/events`, { title: 'Kickoff', startsAt: '2030-01-01T10:00:00Z', endsAt: '2030-01-01T11:00:00Z', projectId: project.id });
    assert.equal((await t.call('mem', 'PATCH', `${ws}/projects/${project.id}`, { visibility: 'TEAM' })).status, 200);
  });
  after(async () => { await t?.close(); await rm(dir, { recursive: true, force: true }); });

  test('files on a hidden task or project cannot be listed or attached by people outside its team', async () => {
    for (const query of [`taskId=${task.id}`, `projectId=${project.id}`]) {
      assert.equal((await t.call('mem2', 'GET', `${ws}/files/attachments?${query}`)).status, 404, query);
      assert.equal((await t.call('mem2', 'POST', `${ws}/files/attachments`, { fileId: file.id, [query.split('=')[0]]: query.split('=')[1] })).status, 404, `attach ${query}`);
      assert.equal((await t.call('mem', 'GET', `${ws}/files/attachments?${query}`)).body.length, 1, `the team still sees it: ${query}`);
    }
    assert.equal((await t.call('own', 'GET', `${ws}/files/attachments?taskId=${task.id}`)).status, 200, 'an owner still can');
  });

  test('documents, Knowledge items, events and the dashboard do not name a project or task the reader cannot see', async () => {
    const reads = {
      documents: (await t.call('mem2', 'GET', `${ws}/documents`)).body,
      document: (await t.call('mem2', 'GET', `${ws}/documents/${doc.id}`)).body,
      knowledge: (await t.call('mem2', 'GET', `${ws}/knowledge`)).body,
      events: (await t.call('mem2', 'GET', `${ws}/events`)).body,
      dashboard: (await t.call('mem2', 'GET', `${ws}/dashboard`)).body,
      versions: (await t.call('mem2', 'GET', `${ws}/knowledge/${note.id}/versions`)).body,
      favourites: (await t.call('mem2', 'GET', `${ws}/favourites`)).body,
    };
    for (const [name, body] of Object.entries(reads)) {
      const text = JSON.stringify(body);
      assert.ok(!text.includes('Nightingale') && !text.includes(project.id) && !text.includes(task.id), name);
    }
    assert.ok(JSON.stringify((await t.call('mem', 'GET', `${ws}/documents`)).body).includes('Nightingale'), 'the team still sees the link');
    assert.equal((await t.call('mem2', 'POST', `${ws}/favourites`, { kind: 'PROJECT', entityId: project.id })).status, 400, 'and an outsider cannot pin it');
  });

  test('people outside the team cannot add to the project through task creation or a CSV import either', async () => {
    assert.equal((await t.call('mem2', 'POST', `${ws}/tasks`, { title: 'sneak', projectId: project.id })).status, 404, 'create in the project');
    assert.equal((await t.call('mem2', 'POST', `${ws}/tasks`, { title: 'sneak', parentId: task.id })).status, 404, 'subtask of a hidden task');
    assert.equal((await t.call('mem2', 'POST', `${ws}/tasks/import`, { mode: 'CREATE', projectId: project.id, tasks: [{ title: 'x' }] })).status, 404, 'import into the project');
    const update = await t.call('mem2', 'POST', `${ws}/tasks/import`, { mode: 'UPSERT', tasks: [{ id: task.id, title: 'renamed by an outsider' }] });
    assert.ok([400, 404].includes(update.status), `import cannot rename a hidden task (${update.status})`);
    assert.equal((await t.call('mem', 'GET', `${ws}/tasks`)).body.find((row) => row.id === task.id).title, 'Nightingale task');
    assert.equal((await t.call('mem', 'POST', `${ws}/tasks`, { title: 'teammate adds', projectId: project.id })).status, 201, 'the team still can');
  });
});

describe('security: ids from another workspace never work in a request body', { skip }, () => {
  let t; let A; let B; let a; let b; let other;
  before(async () => {
    t = await boot();
    for (const name of ['ann', 'ben']) await t.user(name);
    A = await t.workspace('ann'); B = await t.workspace('ben'); a = `/workspaces/${A.id}`; b = `/workspaces/${B.id}`;
    await t.plan(A.id, 'PRO'); await t.plan(B.id, 'PRO');
    other = {
      project: (await t.call('ben', 'POST', `${b}/projects`, { name: 'Theirs' })).body,
      task: (await t.call('ben', 'POST', `${b}/tasks`, { title: 'Theirs' })).body,
      doc: (await t.call('ben', 'POST', `${b}/documents`, { title: 'Theirs', content: '' })).body,
    };
    other.milestone = (await t.call('ben', 'POST', `${b}/projects/${other.project.id}/milestones`, { title: 'M' })).body;
  });
  after(async () => { await t?.close(); });

  test('every reference to a project, task, document, milestone, person or file of another workspace is refused', async () => {
    const mine = { project: (await t.call('ann', 'POST', `${a}/projects`, { name: 'Mine' })).body, task: (await t.call('ann', 'POST', `${a}/tasks`, { title: 'Mine' })).body };
    const benId = (await t.prisma.user.findFirst({ where: { displayName: 'ben' } })).id;
    const refused = (name, response) => assert.ok([400, 403, 404].includes(response.status), `${name}: ${response.status} ${JSON.stringify(response.body).slice(0, 120)}`);
    const call = (method, path, body) => t.call('ann', method, `${a}${path}`, body);
    refused('task in their project', await call('POST', '/tasks', { title: 'x', projectId: other.project.id }));
    refused('task assigned to their person', await call('POST', '/tasks', { title: 'x', assigneeId: benId }));
    refused('task under their parent', await call('POST', '/tasks', { title: 'x', parentId: other.task.id }));
    refused('task with their milestone', await call('POST', '/tasks', { title: 'x', projectId: mine.project.id, milestoneId: other.milestone.id }));
    refused('assign my task to their person', await call('PATCH', `/tasks/${mine.task.id}`, { assigneeId: benId }));
    refused('their milestone on my task', await call('PATCH', `/tasks/${mine.task.id}`, { milestoneId: other.milestone.id }));
    refused('depend on their task', await call('PUT', `/tasks/${mine.task.id}/dependencies`, { dependsOnTaskIds: [other.task.id] }));
    refused('their task, edited through mine', await call('PATCH', `/tasks/${other.task.id}`, { title: 'hijack' }));
    refused('project owned by their person', await call('POST', '/projects', { name: 'x', ownerId: benId }));
    refused('their person on my team', await call('POST', `/projects/${mine.project.id}/team`, { userId: benId }));
    refused('event linked to their project', await call('POST', '/events', { title: 'x', startsAt: '2030-01-01T10:00:00Z', endsAt: '2030-01-01T11:00:00Z', projectId: other.project.id }));
    refused('event linked to their task', await call('POST', '/events', { title: 'x', startsAt: '2030-01-01T10:00:00Z', endsAt: '2030-01-01T11:00:00Z', taskId: other.task.id }));
    refused('document in their project', await call('POST', '/documents', { title: 'x', content: '', projectId: other.project.id }));
    refused('document in their folder', await call('POST', '/documents', { title: 'x', content: '', folderId: other.doc.id }));
    refused('Knowledge linked to their project', await call('POST', '/knowledge', { title: 'x', content: 'x', projectId: other.project.id }));
    refused('Knowledge linked to their task', await call('POST', '/knowledge', { title: 'x', content: 'x', taskId: other.task.id }));
    refused('Knowledge linked to their document', await call('POST', '/knowledge', { title: 'x', content: 'x', documentId: other.doc.id }));
    refused('their document through my URL', await call('GET', `/documents/${other.doc.id}`));
    refused('their document, edited through my URL', await call('PATCH', `/documents/${other.doc.id}`, { title: 'hijack' }));
    refused('their project through my URL', await call('GET', `/projects/${other.project.id}`));
    const upload = (await t.upload('ann', A.id, Buffer.from('mine'), 'name=mine.txt', 'text/plain')).body;
    refused('their task as an attachment target', await call('POST', '/files/attachments', { fileId: upload.id, taskId: other.task.id }));
    const theirFile = (await t.upload('ben', B.id, Buffer.from('theirs'), 'name=theirs.txt', 'text/plain')).body;
    refused('their file attached to my task', await call('POST', '/files/attachments', { fileId: theirFile.id, taskId: mine.task.id }));
    refused('their file downloaded through my URL', await call('GET', `/files/${theirFile.id}/download`));
    assert.equal((await t.call('ben', 'GET', `${b}/tasks`)).body.find((row) => row.id === other.task.id).title, 'Theirs', 'nothing of theirs changed');
  });
});
