import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { cleanFileName, downloadHeaders, normalizeMimeType, uniqueName } from '../dist/files/file-rules.js';
import { LocalStorageDriver } from '../dist/files/storage.js';
import { extractWikiLinks, tagCounts } from '../dist/productivity/knowledge-links.js';
import { readApiEnvironment } from '../dist/config/api-environment.js';

test('file names: trimmed, normalised, and free of path or control characters', () => {
  assert.equal(cleanFileName('  report final.pdf '), 'report final.pdf');
  for (const bad of ['', '   ', '.', '..', 'a/b', 'a\\b', 'bad\u0000name', 'tab\tname', 'x'.repeat(256), null, 5]) assert.throws(() => cleanFileName(bad), BadRequestException, String(bad));
});

test('taken names become "name (1).ext", case-insensitively, and keep the extension', () => {
  assert.equal(uniqueName('a.txt', []), 'a.txt');
  assert.equal(uniqueName('a.txt', ['A.TXT']), 'a (1).txt');
  assert.equal(uniqueName('a.txt', ['a.txt', 'a (1).txt']), 'a (2).txt');
  assert.equal(uniqueName('Makefile', ['makefile']), 'Makefile (1)');
  assert.equal(uniqueName('.env', ['.env']), '.env (1)');
  assert.ok(uniqueName('x'.repeat(255), ['x'.repeat(255)]).length <= 255);
});

test('mime types are normalised and anything odd becomes a generic binary', () => {
  assert.equal(normalizeMimeType('Image/PNG; charset=binary'), 'image/png');
  for (const bad of [undefined, '', 'nonsense', 'a/b/c', '<script>/x', 'x'.repeat(200) + '/y', ['image/png']]) assert.equal(normalizeMimeType(bad), 'application/octet-stream');
});

test('only safe types are ever inline; SVG and HTML always download, with locked-down headers', () => {
  assert.match(downloadHeaders('p.png', 'image/png', true)['Content-Disposition'], /^inline/);
  assert.equal(downloadHeaders('p.png', 'image/png', false)['Content-Type'], 'application/octet-stream');
  for (const type of ['image/svg+xml', 'text/html', 'application/javascript']) {
    const headers = downloadHeaders('x', type, true);
    assert.match(headers['Content-Disposition'], /^attachment/);
    assert.equal(headers['Content-Type'], 'application/octet-stream');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  }
  const unicode = downloadHeaders('résumé "final".pdf', 'application/pdf', false)['Content-Disposition'];
  assert.match(unicode, /filename="r_sum_ _final_.pdf"|filename="r_sum_ _final_\.pdf"|filename="r_sum_/);
  assert.match(unicode, /filename\*=UTF-8''r%C3%A9sum%C3%A9%20%22final%22\.pdf/);
});

test('local storage stores, reads back, hashes and deletes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aven-storage-'));
  try {
    const storage = new LocalStorageDriver(dir);
    const { size, checksum } = await storage.put('ws/abc', Readable.from([Buffer.from('hello '), Buffer.from('world')]), 1000);
    assert.equal(size, 11);
    assert.equal(checksum, 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    const { stream, size: stored } = await storage.get('ws/abc');
    assert.equal(stored, 11);
    assert.equal(Buffer.concat(await stream.toArray()).toString(), 'hello world');
    await storage.delete('ws/abc');
    await storage.delete('ws/abc');
    await assert.rejects(storage.get('ws/abc'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('an upload over the size limit is rejected and leaves nothing on disk', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aven-storage-'));
  try {
    const storage = new LocalStorageDriver(dir);
    await assert.rejects(storage.put('ws/big', Readable.from([Buffer.alloc(600), Buffer.alloc(600)]), 1000), PayloadTooLargeException);
    assert.deepEqual(await readdir(join(dir, 'ws')), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('storage keys cannot escape the storage directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aven-storage-'));
  try {
    const storage = new LocalStorageDriver(dir);
    for (const key of ['../evil', 'ws/../../evil', '/etc/passwd', 'a\u0000b']) await assert.rejects(storage.put(key, Readable.from([Buffer.from('x')]), 100), /Invalid storage key/, key);
    await assert.rejects(storage.get('../evil'), /Invalid storage key/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('storage settings default sensibly and reject bad values', () => {
  const base = { DATABASE_URL: 'postgresql://aven:x@localhost:5432/aven' };
  const defaults = readApiEnvironment(base);
  assert.deepEqual([defaults.storageDriver, defaults.storageDir, defaults.maxUploadBytes, defaults.storageQuotaBytes], ['local', '.storage', 26214400, 524288000]);
  assert.equal(readApiEnvironment({ ...base, MAX_UPLOAD_BYTES: '1048576', STORAGE_DIR: '/data/aven' }).maxUploadBytes, 1048576);
  for (const bad of [{ MAX_UPLOAD_BYTES: '0' }, { MAX_UPLOAD_BYTES: '-5' }, { MAX_UPLOAD_BYTES: '1.5' }, { MAX_UPLOAD_BYTES: 'big' }, { WORKSPACE_STORAGE_QUOTA_BYTES: 'x' }, { STORAGE_DRIVER: 's3' }]) {
    assert.throws(() => readApiEnvironment({ ...base, ...bad }), /Invalid API environment/, JSON.stringify(bad));
  }
});

test('wiki links: unique, trimmed, whitespace-collapsed, ignoring malformed brackets', () => {
  assert.deepEqual(extractWikiLinks('See [[Onboarding]] and [[ onboarding ]] plus [[Brand  Guide]].'), ['Onboarding', 'Brand Guide']);
  assert.deepEqual(extractWikiLinks('[[]] [ [no] ] [[a\nb]] [[[nested]]] text'), ['nested']);
  assert.equal(extractWikiLinks(Array.from({ length: 80 }, (_, i) => `[[T${i}]]`).join(' ')).length, 50);
  assert.deepEqual(extractWikiLinks('no links here'), []);
});

test('tag counts are per item, most used first, then alphabetical', () => {
  assert.deepEqual(tagCounts([{ tags: ['b', 'a', 'a'] }, { tags: ['a'] }, { tags: ['c', 'b'] }, { tags: [] }]), [{ tag: 'a', count: 2 }, { tag: 'b', count: 2 }, { tag: 'c', count: 1 }]);
});

test('byte sizes are described in a readable way', async () => {
  const { formatBytes } = await import('../dist/files/file-rules.js');
  assert.deepEqual([formatBytes(500), formatBytes(2048), formatBytes(25 * 1024 * 1024), formatBytes(1536 * 1024)], ['500 bytes', '2 KB', '25 MB', '1.5 MB']);
});

// ---- S3 driver ----
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { S3StorageDriver, signV4 } from '../dist/files/s3-storage.js';

test('SigV4 produces a well-formed authorization header', () => {
  const signed = signV4({ method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', region: 'us-east-1', accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', now: new Date('2013-05-24T00:00:00Z') });
  assert.match(signed.authorization, /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20130524\/us-east-1\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  assert.equal(signed['x-amz-date'], '20130524T000000Z');
});

test('S3 driver stores, reads, enforces the size cap and deletes against a stub server', async () => {
  const objects = new Map();
  const seen = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, hash: req.headers['x-amz-content-sha256'], bodyHash: createHash('sha256').update(body).digest('hex') });
      if (req.method === 'PUT') { objects.set(req.url, body); res.writeHead(200).end(); }
      else if (req.method === 'GET') { const o = objects.get(req.url); if (!o) return res.writeHead(404).end(); res.writeHead(200, { 'content-length': o.length }).end(o); }
      else { objects.delete(req.url); res.writeHead(204).end(); }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const s3 = new S3StorageDriver({ bucket: 'b', region: 'eu-west-1', accessKeyId: 'AK', secretAccessKey: 'SK', endpoint: `http://127.0.0.1:${server.address().port}` });
    const { size, checksum } = await s3.put('ws/a b.txt', Readable.from([Buffer.from('hello '), Buffer.from('world')]), 100);
    assert.equal(size, 11);
    assert.equal(checksum, createHash('sha256').update('hello world').digest('hex'));
    assert.equal(seen[0].url, '/b/ws/a%20b.txt');
    assert.equal(seen[0].hash, seen[0].bodyHash);
    assert.match(seen[0].auth, /Credential=AK\/\d{8}\/eu-west-1\/s3\/aws4_request/);
    const got = await s3.get('ws/a b.txt');
    assert.equal(got.size, 11);
    let text = ''; for await (const c of got.stream) text += c;
    assert.equal(text, 'hello world');
    await assert.rejects(s3.put('big', Readable.from([Buffer.alloc(50), Buffer.alloc(60)]), 100), /Files can be up to/);
    assert.equal(objects.has('/b/big'), false);
    await s3.delete('ws/a b.txt');
    await s3.delete('ws/a b.txt');
    await assert.rejects(s3.get('ws/a b.txt'));
    await assert.rejects(s3.get('../x'), /Invalid storage key/);
  } finally { server.close(); }
});
