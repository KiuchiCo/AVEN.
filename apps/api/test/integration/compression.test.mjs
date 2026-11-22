import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { request } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('performance: large responses are compressed, live streams are not', { skip }, () => {
  let t; let W; let ws;
  before(async () => { t = await boot(); await t.user('gz'); W = await t.workspace('gz'); ws = `/workspaces/${W.id}`; for (let i = 0; i < 40; i += 1) await t.call('gz', 'POST', `${ws}/tasks`, { title: `Task ${i} about invoices and gardens`, description: 'Some description text. '.repeat(5) }); });
  after(async () => { await t?.close(); });

  const get = (path, headers) => new Promise((resolve, reject) => { const url = new URL(`${t.base}${path}`); request({ hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: { ...t.headers('gz'), ...headers } }, (response) => { const chunks = []; response.on('data', (c) => chunks.push(c)); response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) })); }).on('error', reject).end(); });

  test('a long list is gzipped for a browser that accepts it, and the same list is plain for one that does not', async () => {
    const zipped = await get(`${ws}/tasks`, { 'accept-encoding': 'gzip' });
    assert.equal(zipped.headers['content-encoding'], 'gzip');
    const plain = await get(`${ws}/tasks`, { 'accept-encoding': 'identity' });
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.deepEqual(JSON.parse(gunzipSync(zipped.body).toString()), JSON.parse(plain.body.toString()), 'identical content');
    assert.ok(zipped.body.length < plain.body.length / 3, `${zipped.body.length} bytes against ${plain.body.length}`);
  });

  test('small answers are left alone', async () => {
    const small = await get('/health', { 'accept-encoding': 'gzip' }); assert.equal(small.headers['content-encoding'], undefined);
  });

  test('a live stream is never compressed, and still delivers its first event straight away', async () => {
    const doc = (await t.call('gz', 'POST', `${ws}/documents`, { title: 'Live', content: '' })).body;
    const result = await new Promise((resolve, reject) => {
      const url = new URL(`${t.base}${ws}/documents/${doc.id}/stream`);
      const req = request({ hostname: url.hostname, port: url.port, path: url.pathname, headers: { ...t.headers('gz'), 'accept-encoding': 'gzip' } }, (response) => {
        response.once('data', (chunk) => { resolve({ encoding: response.headers['content-encoding'], first: chunk.toString() }); req.destroy(); });
      }); req.on('error', () => undefined); req.end(); setTimeout(() => reject(new Error('no event within 3 s: the stream is being held back')), 3000);
    });
    assert.equal(result.encoding, undefined); assert.match(result.first, /connected/);
  });
});
