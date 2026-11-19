import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

const MB = 1024 * 1024;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

describe('file storage', { skip }, () => {
  let t; let W; let dir;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aven-files-'));
    t = await boot({ STORAGE_DIR: dir, MAX_UPLOAD_BYTES: String(4 * MB), WORKSPACE_STORAGE_QUOTA_BYTES: String(6 * MB) });
    await t.user('fay'); await t.user('gus'); W = await t.workspace('fay');
  });
  after(async () => { await t?.close(); await rm(dir, { recursive: true, force: true }); });
  const url = (path) => `${t.base}/workspaces/${W.id}/files${path}`;
  const download = (who, id, query = '') => fetch(url(`/${id}/download${query}`), { headers: t.headers(who) });

  test('files come back byte for byte, and active content is never shown inline', async () => {
    const bytes = randomBytes(1_000_000);
    const saved = (await t.upload('fay', W.id, bytes, 'name=photo.bin', 'image/png')).body;
    const response = await download('fay', saved.id, '?inline=1');
    assert.equal(sha(Buffer.from(await response.arrayBuffer())), sha(bytes));
    assert.match(response.headers.get('content-disposition'), /^inline/);
    const json = Buffer.from('{"a":[1,2,3]}');
    const jsonFile = (await t.upload('fay', W.id, json, 'name=data.json', 'application/json')).body;
    assert.equal(Buffer.from(await (await download('fay', jsonFile.id)).arrayBuffer()).equals(json), true, 'JSON uploads are not eaten by the JSON parser');
    const svg = (await t.upload('fay', W.id, Buffer.from('<svg onload=alert(1)>'), 'name=x.svg', 'image/svg+xml')).body;
    const shown = await download('fay', svg.id, '?inline=1');
    assert.match(shown.headers.get('content-disposition'), /^attachment/);
    assert.equal(shown.headers.get('x-content-type-options'), 'nosniff');
  });

  test('size limits, empty files, bad names and other workspaces’ members are refused', async () => {
    assert.equal((await t.upload('fay', W.id, randomBytes(5 * MB), 'name=big.bin')).status, 413);
    assert.equal((await t.upload('fay', W.id, Buffer.alloc(0), 'name=empty.txt')).status, 400);
    assert.equal((await t.upload('fay', W.id, Buffer.from('x'), 'name=a%2Fb.txt')).status, 400);
    const own = (await t.upload('fay', W.id, Buffer.from('mine'), 'name=mine.txt')).body;
    assert.equal((await download('gus', own.id)).status, 404);
  });

  test('parallel uploads cannot exceed the storage quota, and nothing is left behind', async () => {
    const before = await t.prisma.storedFile.aggregate({ where: { workspaceId: W.id }, _sum: { sizeBytes: true } });
    const room = 6 * MB - (before._sum.sizeBytes ?? 0);
    const size = Math.floor(room * 0.6);
    assert.ok(size > 0 && size <= 4 * MB, `test setup: ${size}`);
    const results = await Promise.all([1, 2].map((n) => t.upload('fay', W.id, randomBytes(size), `name=race${n}.bin`)));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 413]);
    const after = await t.prisma.storedFile.aggregate({ where: { workspaceId: W.id }, _sum: { sizeBytes: true } });
    assert.ok((after._sum.sizeBytes ?? 0) <= 6 * MB);
    const keys = (await t.prisma.storedFile.findMany({ where: { workspaceId: W.id }, select: { storageKey: true } })).map((f) => f.storageKey);
    assert.ok(keys.every((key) => existsSync(join(dir, key))), 'every row has its file on disk');
  });

  test('new versions keep the old contents, and the recycle bin removes contents only when emptied', async () => {
    const v1 = Buffer.from('version one'); const v2 = Buffer.from('version two!');
    const file = (await t.upload('fay', W.id, v1, 'name=notes.txt', 'text/plain')).body;
    const replaced = (await t.upload('fay', W.id, v2, `name=ignored.txt&replaceFileId=${file.id}`, 'text/plain')).body;
    assert.deepEqual([replaced.version, replaced.name], [2, 'notes.txt']);
    assert.equal(Buffer.from(await (await download('fay', file.id, '?version=1')).arrayBuffer()).toString(), 'version one');
    assert.equal(Buffer.from(await (await download('fay', file.id)).arrayBuffer()).toString(), 'version two!');
    const stored = await t.prisma.storedFile.findUnique({ where: { id: file.id }, include: { versions: true } });
    const keys = [stored.storageKey, ...stored.versions.map((v) => v.storageKey)];
    await t.call('fay', 'DELETE', `/workspaces/${W.id}/files/${file.id}`);
    assert.equal((await download('fay', file.id)).status, 404, 'deleted files cannot be downloaded');
    assert.ok(keys.every((key) => existsSync(join(dir, key))), 'still recoverable in the bin');
    assert.equal((await t.call('fay', 'POST', `/workspaces/${W.id}/files/${file.id}/restore`)).status, 201);
    await t.call('fay', 'DELETE', `/workspaces/${W.id}/files/${file.id}`);
    assert.equal((await t.call('fay', 'DELETE', `/workspaces/${W.id}/files/${file.id}/permanent`)).status, 200);
    assert.ok(keys.every((key) => !existsSync(join(dir, key))), 'contents are gone after deleting forever');
  });

  test('a file attaches to one task, and deleting the task keeps the file', async () => {
    const task = (await t.call('fay', 'POST', `/workspaces/${W.id}/tasks`, { title: 'With file' })).body;
    const file = (await t.upload('fay', W.id, Buffer.from('attach me'), 'name=attach.txt')).body;
    const attach = (body) => t.call('fay', 'POST', `/workspaces/${W.id}/files/attachments`, body);
    assert.equal((await attach({ fileId: file.id, taskId: task.id })).status, 201);
    assert.equal((await attach({ fileId: file.id, taskId: task.id })).status, 409);
    assert.equal((await attach({ fileId: file.id, taskId: task.id, projectId: task.id })).status, 400);
    assert.equal((await t.call('fay', 'GET', `/workspaces/${W.id}/files/attachments?taskId=${task.id}`)).body.length, 1);
    await t.call('fay', 'DELETE', `/workspaces/${W.id}/tasks/${task.id}`);
    assert.equal(await t.prisma.storedFile.count({ where: { id: file.id } }), 1);
    assert.equal(await t.prisma.fileAttachment.count({ where: { fileId: file.id } }), 0);
  });

  test('a text file can be added to Knowledge; other files, guests and strangers cannot', async () => {
    const md = (await t.upload('fay', W.id, Buffer.from('# Launch plan\n\nShip the zebra feature on Friday.'), 'name=launch_plan.md', 'text/markdown')).body;
    const toKnowledge = (who, id, body = {}) => t.call(who, 'POST', `/workspaces/${W.id}/files/${id}/knowledge`, body);
    const made = await toKnowledge('fay', md.id, { tags: ['Plans', 'plans'] });
    assert.equal(made.status, 201, JSON.stringify(made.body)); assert.equal(made.body.title, 'launch plan'); assert.equal(made.body.truncated, false);
    const found = (await t.call('fay', 'GET', `/workspaces/${W.id}/knowledge?q=zebra`)).body;
    const item = (found.items ?? found).find((entry) => entry.id === made.body.id);
    assert.ok(item, 'the new entry is searchable'); assert.deepEqual(item.tags, ['plans']); assert.match(item.content, /Ship the zebra feature/);
    const big = (await t.upload('fay', W.id, Buffer.from('lorem '.repeat(8000)), 'name=big.txt', 'text/plain')).body;
    assert.equal((await toKnowledge('fay', big.id)).body.truncated, true);
    const png = (await t.upload('fay', W.id, Buffer.from([137, 80, 78, 71, 0, 1, 2]), 'name=pic.png', 'image/png')).body;
    assert.equal((await toKnowledge('fay', png.id)).status, 400);
    await t.member(W.id, 'gus', 'GUEST');
    assert.equal((await toKnowledge('gus', md.id)).status, 403, 'guests cannot add entries');
    await t.user('hal'); assert.equal((await toKnowledge('hal', md.id)).status, 404, 'a stranger cannot reach the file');
    assert.equal((await toKnowledge('fay', '11111111-1111-4111-8111-111111111111')).status, 404);
  });
});

