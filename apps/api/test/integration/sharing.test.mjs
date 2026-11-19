import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boot, skip } from './harness.mjs';

// A 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

describe('document sharing', { skip }, () => {
  let t; let W; let dir; let doc; let other;
  const base = () => `/workspaces/${W.id}/documents/${doc.id}/shares`;
  const pub = (token, path = '') => fetch(`${t.base}/shared/documents/${token}${path}`);
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aven-share-'));
    t = await boot({ STORAGE_DIR: dir, WEB_ORIGIN: 'http://localhost:3000' });
    for (const name of ['sue', 'tom', 'gus', 'zed']) await t.user(name);
    W = await t.workspace('sue'); await t.member(W.id, 'tom', 'MEMBER'); await t.member(W.id, 'gus', 'GUEST');
    const image = (await t.upload('sue', W.id, PNG, 'name=map.png', 'image/png')).body; const secret = (await t.upload('sue', W.id, PNG, 'name=secret.png', 'image/png')).body;
    const content = JSON.stringify({ format: 'aven-doc-v1', blocks: [{ id: 'a', type: 'HEADING_1', text: 'Launch plan' }, { id: 'b', type: 'PARAGRAPH', text: 'Ship on Friday.' }, { id: 'c', type: 'IMAGE', text: 'Site map', fileId: image.id }] });
    doc = (await t.call('sue', 'POST', `/workspaces/${W.id}/documents`, { title: 'Plan', content })).body;
    doc.imageId = image.id; doc.secretId = secret.id;
    other = await t.workspace('zed', 'Other');
  });
  after(async () => { await t?.close(); await rm(dir, { recursive: true, force: true }); });

  test('members create links; guests and outsiders cannot; the secret is shown once and never stored', async () => {
    assert.equal((await t.call('gus', 'POST', base(), {})).status, 403); assert.equal((await t.call('zed', 'POST', base(), {})).status, 404);
    const made = await t.call('tom', 'POST', base(), { expiresInDays: 30 });
    assert.equal(made.status, 201, JSON.stringify(made.body)); assert.match(made.body.url, /^http:\/\/localhost:3000\/shared\/[A-Za-z0-9_-]{40,}$/); assert.ok(made.body.expiresAt);
    const row = await t.prisma.documentShare.findUniqueOrThrow({ where: { id: made.body.id } });
    assert.ok(!JSON.stringify(row).includes(made.body.token), 'only a hash is stored'); assert.equal(row.tokenHash.length, 64);
    const listed = await t.call('gus', 'GET', base()); assert.equal(listed.status, 200, 'anyone in the workspace can see which links exist');
    assert.ok(!JSON.stringify(listed.body).includes(made.body.token), 'the list never contains the secret'); assert.equal(listed.body[0].state, 'ACTIVE');
    assert.equal((await t.call('sue', 'POST', base(), { expiresInDays: 5 })).status, 400);
    doc.token = made.body.token; doc.shareId = made.body.id;
  });

  test('the link shows the document without signing in, read-only, uncached and not indexable', async () => {
    const response = await pub(doc.token); assert.equal(response.status, 200);
    assert.match(response.headers.get('x-robots-tag'), /noindex/); assert.match(response.headers.get('cache-control'), /no-store/);
    const body = await response.json(); assert.equal(body.title, 'Plan'); assert.deepEqual(body.blocks.map((b) => b.type), ['HEADING_1', 'PARAGRAPH', 'IMAGE']);
    assert.equal(body.blocks[2].image, `/api/v1/shared/documents/${doc.token}/images/${doc.imageId}`);
    assert.equal(JSON.stringify(body).includes(W.id), false, 'no workspace ids leak'); assert.equal('content' in body, false);
    const views = (await t.call('sue', 'GET', base())).body[0]; assert.equal(views.viewCount, 1); assert.ok(views.lastViewedAt);
    assert.equal((await t.call(null, 'PATCH', `/workspaces/${W.id}/documents/${doc.id}`, { title: 'x' })).status, 401, 'the link grants no write access anywhere');
  });

  test('only the document’s own images are served, with safe headers', async () => {
    const ok = await pub(doc.token, `/images/${doc.imageId}`); assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/png'); assert.equal(ok.headers.get('x-content-type-options'), 'nosniff'); assert.deepEqual(Buffer.from(await ok.arrayBuffer()), PNG);
    assert.equal((await pub(doc.token, `/images/${doc.secretId}`)).status, 404, 'another file from the same workspace is refused');
    assert.equal((await pub(doc.token, '/images/11111111-1111-4111-8111-111111111111')).status, 404);
  });

  test('wrong, revoked and expired links all fail the same way', async () => {
    const same = async (token) => { const r = await pub(token); return [r.status, (await r.json()).message]; };
    const missing = await same('A'.repeat(43)); assert.deepEqual(missing, [404, 'This link is no longer available.']);
    assert.deepEqual(await same('short'), missing); assert.deepEqual(await same('x'.repeat(30) + '!!'), missing);
    const second = (await t.call('sue', 'POST', base(), {})).body; assert.equal((await pub(second.token)).status, 200);
    assert.equal((await t.call('gus', 'DELETE', `${base()}/${second.id}`)).status, 403); assert.equal((await t.call('zed', 'DELETE', `${base()}/${second.id}`)).status, 404);
    assert.equal((await t.call('tom', 'DELETE', `${base()}/${second.id}`)).status, 200);
    assert.deepEqual(await same(second.token), missing); assert.equal((await pub(second.token, `/images/${doc.imageId}`)).status, 404);
    assert.equal((await t.call('tom', 'DELETE', `${base()}/${second.id}`)).status, 404, 'revoking twice');
    const expiring = (await t.call('sue', 'POST', base(), { expiresInDays: 7 })).body;
    await t.prisma.documentShare.update({ where: { id: expiring.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.deepEqual(await same(expiring.token), missing);
    assert.equal((await t.call('sue', 'GET', base())).body.find((s) => s.id === expiring.id).state, 'EXPIRED');
  });

  test('a link can’t be moved between documents or workspaces, deleting the document removes its links, and there is a cap', async () => {
    const foreign = (await t.call('zed', 'POST', `/workspaces/${other.id}/documents`, { title: 'Theirs', content: 'private' })).body;
    assert.equal((await t.call('sue', 'POST', `/workspaces/${W.id}/documents/${foreign.id}/shares`, {})).status, 404);
    assert.equal((await t.call('sue', 'POST', `/workspaces/${other.id}/documents/${foreign.id}/shares`, {})).status, 404);
    const extra = (await t.call('sue', 'POST', `/workspaces/${W.id}/documents`, { title: 'Capped', content: 'x' })).body;
    for (let i = 0; i < 10; i += 1) assert.equal((await t.call('sue', 'POST', `/workspaces/${W.id}/documents/${extra.id}/shares`, {})).status, 201);
    assert.equal((await t.call('sue', 'POST', `/workspaces/${W.id}/documents/${extra.id}/shares`, {})).status, 400);
    const link = (await t.prisma.documentShare.findFirstOrThrow({ where: { documentId: extra.id } }));
    assert.equal((await t.call('sue', 'DELETE', `/workspaces/${W.id}/documents/${extra.id}`)).status, 200);
    assert.equal(await t.prisma.documentShare.count({ where: { id: link.id } }), 0);
    assert.ok(await t.prisma.workspaceActivity.findFirst({ where: { workspaceId: W.id, message: { contains: 'public share link' } } }), 'sharing is recorded in the audit trail');
  });
});
