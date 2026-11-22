import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import http2 from 'node:http2';
import { describe, test } from 'node:test';
import { ApnsClient, apnsPayload, isDeadToken } from '../dist/push/apns.js';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const token = 'ab'.repeat(32);

/** A local stand-in for Apple: answers every push with the given status and records what it was sent. */
async function fakeApple(status, reason) {
  const seen = [];
  const server = http2.createServer();
  server.on('stream', (stream, headers) => {
    let body = ''; stream.on('data', (c) => { body += c; });
    stream.on('end', () => { seen.push({ headers, body }); stream.respond({ ':status': status }); stream.end(reason ? JSON.stringify({ reason }) : ''); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { seen, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}
const client = (baseUrl, timeout) => new ApnsClient({ keyId: 'KEY1234567', teamId: 'TEAM123456', privateKey: pem, bundleId: 'app.aven.mobile', baseUrl }, timeout);

describe('APNs client', () => {
  test('signs an ES256 provider token Apple can verify, and reuses it', () => {
    const c = client('http://x');
    const jwt = c.providerToken(1_000_000);
    const [h, p, s] = jwt.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KEY1234567' });
    assert.equal(JSON.parse(Buffer.from(p, 'base64url')).iss, 'TEAM123456');
    assert.ok(verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
    assert.equal(c.providerToken(1_000_000 + 39 * 60_000), jwt);
    assert.notEqual(c.providerToken(1_000_000 + 41 * 60_000), jwt);
  });

  test('sends to the device path with the topic and the payload', async () => {
    const apple = await fakeApple(200);
    const result = await client(apple.url).send(token, 'production', apnsPayload({ title: 'T', body: 'B', path: '/workspace/inbox', thread: 'x' }));
    await apple.close();
    assert.equal(result.status, 200);
    assert.equal(apple.seen[0].headers[':path'], `/3/device/${token}`);
    assert.equal(apple.seen[0].headers['apns-topic'], 'app.aven.mobile');
    assert.match(apple.seen[0].headers.authorization, /^bearer /);
    assert.equal(JSON.parse(apple.seen[0].body).path, '/workspace/inbox');
  });

  test('reports dead tokens so they can be forgotten, and other failures without throwing', async () => {
    const gone = await fakeApple(410, 'Unregistered');
    const r = await client(gone.url).send(token, 'production', {}); await gone.close();
    assert.equal(isDeadToken(r), true);
    const bad = await fakeApple(400, 'BadDeviceToken');
    assert.equal(isDeadToken(await client(bad.url).send(token, 'production', {})), true); await bad.close();
    const busy = await fakeApple(429, 'TooManyRequests');
    assert.equal(isDeadToken(await client(busy.url).send(token, 'production', {})), false); await busy.close();
  });

  test('rejects a malformed token without a network call, and times out a silent server', async () => {
    assert.deepEqual(await client('http://127.0.0.1:1').send('../../x', 'production', {}), { status: 400, reason: 'BadDeviceToken' });
    const silent = http2.createServer(); silent.on('stream', () => {});
    await new Promise((r) => silent.listen(0, '127.0.0.1', r));
    const r = await client(`http://127.0.0.1:${silent.address().port}`, 200).send(token, 'production', {});
    silent.closeAllConnections?.(); silent.close();
    assert.equal(r.reason, 'Timeout');
  });

  test('trims the title and body', () => {
    const p = apnsPayload({ title: 'a'.repeat(200), body: 'b'.repeat(500), path: '/p', thread: 't' });
    assert.equal(p.aps.alert.title.length, 80); assert.equal(p.aps.alert.body.length, 180);
  });
});
