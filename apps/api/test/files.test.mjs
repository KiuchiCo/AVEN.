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
