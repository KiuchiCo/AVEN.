import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('document comment threads', { skip }, () => {
  let t; let W; let doc;
  const base = () => `/workspaces/${W.id}/documents/${doc.id}/comments`;
  before(async () => {
    t = await boot();
    for (const n of ['cora', 'cal', 'gus']) await t.user(n);
    W = await t.workspace('cora'); await t.member(W.id, 'cal', 'MEMBER'); await t.member(W.id, 'gus', 'GUEST');
    doc = (await t.call('cora', 'POST', `/workspaces/${W.id}/documents`, { title: 'Spec', content: '' })).body;
  });
  after(async () => { await t?.close(); });

  test('a comment keeps the block and the words it was made on, and replies hang under it', async () => {
    const top = await t.call('cora', 'POST', base(), { body: 'Is this right?', blockId: 'block-1', quote: 'the second paragraph' });
    assert.equal(top.status, 201);
    assert.equal(top.body.blockId, 'block-1'); assert.equal(top.body.quote, 'the second paragraph'); assert.equal(top.body.parentId, null);
    const reply = await t.call('cal', 'POST', base(), { body: 'Yes.', parentId: top.body.id, blockId: 'ignored', quote: 'ignored' });
    assert.equal(reply.status, 201);
    assert.equal(reply.body.parentId, top.body.id); assert.equal(reply.body.blockId, null); assert.equal(reply.body.quote, null);
    const list = await t.call('cora', 'GET', base());
    assert.equal(list.body.length, 2);
  });

  test('a reply to a reply, or to a comment of another document, is refused', async () => {
    const top = (await t.call('cora', 'POST', base(), { body: 'Top' })).body;
    const reply = (await t.call('cal', 'POST', base(), { body: 'Reply', parentId: top.id })).body;
    assert.equal((await t.call('cal', 'POST', base(), { body: 'Nested', parentId: reply.id })).status, 404);
    const other = (await t.call('cora', 'POST', `/workspaces/${W.id}/documents`, { title: 'Other', content: '' })).body;
    assert.equal((await t.call('cora', 'POST', `/workspaces/${W.id}/documents/${other.id}/comments`, { body: 'x', parentId: top.id })).status, 404);
  });

  test('a guest cannot comment, and a comment longer than the limit is refused', async () => {
    assert.equal((await t.call('gus', 'POST', base(), { body: 'Hi' })).status, 403);
    assert.equal((await t.call('cora', 'POST', base(), { body: 'x'.repeat(2001) })).status, 400);
    assert.equal((await t.call('cora', 'POST', base(), { body: 'ok', quote: 'q'.repeat(301) })).status, 400);
  });

  test('resolving a thread leaves its replies readable', async () => {
    const top = (await t.call('cora', 'POST', base(), { body: 'Resolve me', blockId: 'b2' })).body;
    await t.call('cal', 'POST', base(), { body: 'ack', parentId: top.id });
    assert.equal((await t.call('cora', 'PATCH', `${base()}/${top.id}`, { resolved: true })).status, 200);
    const list = (await t.call('cora', 'GET', base())).body;
    assert.ok(list.find((c) => c.id === top.id).resolvedAt);
    assert.ok(list.some((c) => c.parentId === top.id));
  });

  test('a comment can be reopened after resolving, and deleted by its author or an admin but not by another member', async () => {
    const top = (await t.call('cal', 'POST', base(), { body: 'Mine', blockId: 'b3', quote: 'words' })).body;
    await t.call('cora', 'PATCH', `${base()}/${top.id}`, { resolved: true });
    const reopened = await t.call('cal', 'PATCH', `${base()}/${top.id}`, { resolved: false });
    assert.equal(reopened.status, 200); assert.equal(reopened.body.resolvedAt, null);
    const reply = (await t.call('cora', 'POST', base(), { body: 'Reply', parentId: top.id })).body;
    assert.equal((await t.call('gus', 'DELETE', `${base()}/${top.id}`)).status, 403, 'a guest cannot delete');
    const other = (await t.call('cora', 'POST', base(), { body: 'Cora only' })).body;
    assert.equal((await t.call('cal', 'DELETE', `${base()}/${other.id}`)).status, 403, 'a member cannot delete someone else’s comment');
    assert.equal((await t.call('cal', 'DELETE', `${base()}/${top.id}`)).status, 200);
    const list = (await t.call('cora', 'GET', base())).body;
    assert.ok(!list.some((c) => c.id === top.id || c.id === reply.id), 'the replies go with it');
    assert.equal((await t.call('cora', 'DELETE', `${base()}/${other.id}`)).status, 200);
    assert.equal((await t.call('cora', 'DELETE', `${base()}/${other.id}`)).status, 404);
  });
});
