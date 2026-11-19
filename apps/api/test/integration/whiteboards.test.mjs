import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('whiteboards', { skip }, () => {
  let t; let W; let O;
  const note = (id, text = 'idea') => ({ id, type: 'sticky', x: 0, y: 0, w: 160, h: 120, color: 'amber', text });
  const ws = (w = W) => `/workspaces/${w.id}/whiteboards`;

  before(async () => {
    t = await boot();
    for (const name of ['wes', 'meg', 'gus', 'out']) await t.user(name);
    W = await t.workspace('wes'); await t.member(W.id, 'meg', 'MEMBER'); await t.member(W.id, 'gus', 'GUEST');
    O = await t.workspace('out');
  });
  after(async () => { await t?.close(); });

  test('members create, draw and read; guests read only; outsiders get 404', async () => {
    const made = await t.call('wes', 'POST', ws(), { name: 'Roadmap' });
    assert.equal(made.status, 201); assert.deepEqual(made.body.content, { elements: [] });
    const id = made.body.id;
    const saved = await t.call('meg', 'PATCH', `${ws()}/${id}`, { elements: [note('n1')], baseUpdatedAt: made.body.updatedAt });
    assert.equal(saved.status, 200); assert.equal(saved.body.content.elements[0].text, 'idea');
    assert.equal((await t.call('gus', 'GET', `${ws()}/${id}`)).body.content.elements.length, 1);
    assert.equal((await t.call('gus', 'POST', ws(), { name: 'x' })).status, 403);
    assert.equal((await t.call('gus', 'PATCH', `${ws()}/${id}`, { name: 'x' })).status, 403);
    assert.equal((await t.call('gus', 'DELETE', `${ws()}/${id}`)).status, 403);
    assert.equal((await t.call('out', 'GET', `${ws()}/${id}`)).status, 404);
    assert.equal((await t.call('out', 'GET', ws())).status, 404);
    assert.equal((await t.call('out', 'GET', `${ws(O)}/${id}`)).status, 404, 'a board is not readable through another workspace');
  });

  test('a stale save is refused with the current copy, and invalid drawings are rejected', async () => {
    const made = (await t.call('wes', 'POST', ws(), { name: 'Race' })).body;
    const first = await t.call('wes', 'PATCH', `${ws()}/${made.id}`, { elements: [note('a')], baseUpdatedAt: made.updatedAt });
    assert.equal(first.status, 200);
    const stale = await t.call('meg', 'PATCH', `${ws()}/${made.id}`, { elements: [note('b')], baseUpdatedAt: made.updatedAt });
    assert.equal(stale.status, 409); assert.equal(stale.body.current.content.elements[0].id, 'a');
    assert.equal((await t.call('meg', 'PATCH', `${ws()}/${made.id}`, { elements: [note('b')] })).status, 400);
    assert.equal((await t.call('meg', 'PATCH', `${ws()}/${made.id}`, { elements: [{ ...note('c'), type: 'video' }], baseUpdatedAt: first.body.updatedAt })).status, 400);
    assert.equal((await t.call('meg', 'PATCH', `${ws()}/${made.id}`, { name: 'Renamed' })).body.name, 'Renamed');
    assert.equal((await t.call('wes', 'GET', `${ws()}/${made.id}`)).body.content.elements[0].id, 'a', 'the rejected edits changed nothing');
  });

  test('deleting removes the board and is logged', async () => {
    const made = (await t.call('wes', 'POST', ws(), { name: 'Temp' })).body;
    assert.equal((await t.call('wes', 'DELETE', `${ws()}/${made.id}`)).status, 200);
    assert.equal((await t.call('wes', 'GET', `${ws()}/${made.id}`)).status, 404);
    assert.ok(await t.prisma.workspaceActivity.findFirst({ where: { workspaceId: W.id, entityId: made.id, message: { contains: 'deleted whiteboard' } } }));
  });
});
