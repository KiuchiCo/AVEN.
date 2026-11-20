import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCipheriv, createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from 'node:crypto';
import { encryptPayload, generateVapidKeys, vapidAuthorization } from '../dist/push/push-crypto.js';

/** The browser's side of RFC 8291, written separately from the sender so the two must agree. */
function decrypt(body, ua, authSecret) {
  const salt = body.subarray(0, 16); const idLength = body[20]; const serverPublic = body.subarray(21, 21 + idLength); const data = body.subarray(21 + idLength);
  const shared = ua.computeSecret(serverPublic);
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), serverPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce); decipher.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
  assert.equal(plain[plain.length - 1], 2, 'last record delimiter');
  return plain.subarray(0, plain.length - 1);
}

test('an encrypted push payload decrypts with the subscription keys and nothing else', () => {
  const ua = createECDH('prime256v1'); ua.generateKeys(); const auth = randomBytes(16);
  const subscription = { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') };
  const message = Buffer.from(JSON.stringify({ title: 'Hi', body: 'Ünïcode ✓', url: '/workspace/inbox' }));
  const body = encryptPayload(message, subscription);
  assert.equal(body.readUInt32BE(16), 4096); assert.equal(body[20], 65);
  assert.deepEqual(decrypt(body, ua, auth), message);
  assert.notDeepEqual(encryptPayload(message, subscription), body, 'every message uses a fresh key and salt');
  const other = createECDH('prime256v1'); other.generateKeys();
  assert.throws(() => decrypt(body, other, auth));
  assert.throws(() => decrypt(body, ua, randomBytes(16)));
});

test('bad subscription keys and oversized payloads are refused', () => {
  assert.throws(() => encryptPayload(Buffer.from('x'), { p256dh: 'AAAA', auth: 'AAAA' }), /Invalid push subscription keys/);
  const ua = createECDH('prime256v1'); ua.generateKeys();
  assert.throws(() => encryptPayload(Buffer.alloc(4000), { p256dh: ua.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') }), /too large/);
});

test('the VAPID token is an ES256 JWT for the push service origin that verifies with the public key', () => {
  const keys = generateVapidKeys();
  const header = vapidAuthorization('https://push.example.net/send/abc', keys, 'mailto:admin@example.com', new Date('2026-01-01T00:00:00Z'));
  const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  assert.equal(k, keys.publicKey);
  const [h, c, s] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.equal(claims.aud, 'https://push.example.net'); assert.equal(claims.sub, 'mailto:admin@example.com'); assert.equal(claims.exp, 1767225600 + 12 * 3600);
  const pub = Buffer.from(keys.publicKey, 'base64url');
  const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') } });
  assert.equal(verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), true);
});

import { parseSubscription, pushMessage } from '../dist/push/push-rules.js';
test('subscriptions must be https with real keys, and messages read well', () => {
  const ua = createECDH('prime256v1'); ua.generateKeys();
  const keys = { p256dh: ua.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };
  assert.equal(parseSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys }).p256dh, keys.p256dh);
  assert.throws(() => parseSubscription({ endpoint: 'http://fcm.googleapis.com/x', keys }), /https/);
  assert.throws(() => parseSubscription({ endpoint: 'http://127.0.0.1/x', keys }), /https/, 'loopback is refused unless local development allows it');
  assert.equal(parseSubscription({ endpoint: 'http://127.0.0.1:9/x', keys }, true).endpoint, 'http://127.0.0.1:9/x');
  assert.throws(() => parseSubscription({ endpoint: 'https://u:p@push.example/x', keys }), /https/);
  assert.throws(() => parseSubscription({ endpoint: 'https://push.example/x', keys: { p256dh: 'AAAA', auth: keys.auth } }), /not valid/);
  assert.deepEqual(pushMessage([{ actorName: 'Ann', message: 'assigned you “X”', workspaceName: 'Acme', href: '/workspace/tasks/1' }], 'https://a.test'), { title: 'Acme', body: 'Ann assigned you “X”', url: 'https://a.test/workspace/tasks/1' });
  assert.equal(pushMessage([{}, {}].map(() => ({ actorName: 'a', message: 'm', workspaceName: 'w', href: '/x' })), 'https://a.test').body, 'You have 2 new notifications.');
});
