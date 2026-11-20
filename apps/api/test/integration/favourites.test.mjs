import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('favourites', { skip }, () => {
  let t; let W; let O; let project; let doc; let board; let database;
  const url = () => `${t.base}/workspaces/${W.id}/favourites`;
  const send = (who, method, body, ws = W) => fetch(`${t.base}/workspaces/${ws.id}/favourites`, { method, headers: t.headers(who), body: body === undefined ? undefined : JSON.stringify(body) });
  const list = async (who) => (await t.call(who, 'GET', `/workspaces/${W.id}/favourites`)).body;
  before(async () => {
    t = await boot(); for (const n of ['fia', 'gus', 'hal', 'ivo']) await t.user(n);
    W = await t.workspace('fia'); await t.member(W.id, 'gus', 'MEMBER'); await t.member(W.id, 'hal', 'GUEST'); O = await t.workspace('ivo');
    project = (await t.call('fia', 'POST', `/workspaces/${W.id}/projects`, { name: 'Strategy' })).body;
    doc = (await t.call('fia', 'POST', `/workspaces/${W.id}/documents`, { title: 'Plan', content: '' })).body;
    board = (await t.call('fia', 'POST', `/workspaces/${W.id}/whiteboards`, { name: 'Ideas' })).body;
    database = (await t.call('fia', 'POST', `/workspaces/${W.id}/databases`, { name: 'Pipeline' })).body;
  });
  after(async () => { await t?.close(); });

  test('pinning, listing, un-pinning; pinning twice changes nothing; the list shows live names and links', async () => {
    for (const [kind, entity] of [['PROJECT', project], ['DOCUMENT', doc], ['WHITEBOARD', board], ['DATABASE', database]]) assert.equal((await send('fia', 'POST', { kind, entityId: entity.id })).status, 200);
    assert.equal((await send('fia', 'POST', { kind: 'PROJECT', entityId: project.id })).status, 200);
    const items = await list('fia'); assert.deepEqual(items.map((i) => i.title), ['Strategy', 'Plan', 'Ideas', 'Pipeline']);
    assert.equal(items[0].href, `/workspace/projects/${project.id}`); assert.equal(items[3].href, '/workspace/databases');
    await t.call('fia', 'PATCH', `/workspaces/${W.id}/documents/${doc.id}`, { title: 'Plan v2', baseUpdatedAt: doc.updatedAt });
    assert.equal((await list('fia'))[1].title, 'Plan v2', 'a renamed item shows its new name');
    assert.equal((await send('fia', 'DELETE', { kind: 'DOCUMENT', entityId: doc.id })).status, 200);
    assert.deepEqual((await list('fia')).map((i) => i.title), ['Strategy', 'Ideas', 'Pipeline']);
  });

  test('favourites are private to each person, and guests may keep their own', async () => {
    assert.deepEqual(await list('gus'), []);
    assert.equal((await send('gus', 'POST', { kind: 'PROJECT', entityId: project.id })).status, 200);
    assert.equal((await list('gus')).length, 1); assert.equal((await list('fia')).length, 3, 'one person’s pin does not appear for another');
    assert.equal((await send('hal', 'POST', { kind: 'PROJECT', entityId: project.id })).status, 200);
    await send('gus', 'DELETE', { kind: 'PROJECT', entityId: project.id }); assert.equal((await list('fia')).some((i) => i.entityId === project.id), true, 'removing mine leaves yours');
  });

  test('only things in this workspace can be pinned, outsiders are refused, and deleted items disappear', async () => {
    const theirs = (await t.call('ivo', 'POST', `/workspaces/${O.id}/projects`, { name: 'Theirs' })).body;
    assert.equal((await send('fia', 'POST', { kind: 'PROJECT', entityId: theirs.id })).status, 400);
    assert.equal((await send('fia', 'POST', { kind: 'PROJECT', entityId: '22222222-2222-4222-8222-222222222222' })).status, 400);
    assert.equal((await send('fia', 'POST', { kind: 'TASK', entityId: project.id })).status, 400);
    assert.equal((await send('ivo', 'POST', { kind: 'PROJECT', entityId: project.id })).status, 404, 'a non-member');
    assert.equal((await fetch(url())).status, 401);
    await t.call('fia', 'DELETE', `/workspaces/${W.id}/whiteboards/${board.id}`);
    assert.equal((await list('fia')).some((i) => i.kind === 'WHITEBOARD'), false);
    assert.equal(await t.prisma.favourite.count({ where: { entityId: board.id } }), 0, 'the pin for a deleted item is cleaned up');
  });

  test('there is a limit of 30 pins', async () => {
    const made = []; for (let i = 0; i < 31; i += 1) made.push((await t.call('gus', 'POST', `/workspaces/${W.id}/whiteboards`, { name: `B${i}` })).body);
    let last = 200; for (const b of made) last = (await send('gus', 'POST', { kind: 'WHITEBOARD', entityId: b.id })).status;
    assert.equal(last, 400); assert.equal((await list('gus')).length, 30);
  });
});
