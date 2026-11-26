import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';
import { generateVapidKeys } from '../../dist/push/push-crypto.js';

function decrypt(body, ua, authSecret) {
  const salt = body.subarray(0, 16); const serverPublic = body.subarray(21, 21 + body[20]); const data = body.subarray(21 + body[20]);
  const ikm = Buffer.from(hkdfSync('sha256', ua.computeSecret(serverPublic), authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), serverPublic]), 32));
  const d = createDecipheriv('aes-128-gcm', Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)), Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12)));
  d.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  return JSON.parse(plain.subarray(0, plain.length - 1).toString());
}

describe('browser push notifications', { skip }, () => {
  let t; let W; let service; let received; let status; let service2; let pushService; let users; let ua; let auth; let sub;
  const ws = () => `/workspaces/${W.id}`;
  const assign = (title, who, by = 'ann') => t.call(by, 'POST', `${ws()}/tasks`, { title, assigneeId: users[who].id });

  before(async () => {
    received = []; status = 201;
    service = createServer((req, res) => { const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { received.push({ headers: req.headers, body: Buffer.concat(chunks), url: req.url }); res.writeHead(status).end(); }); });
    await new Promise((r) => service.listen(0, '127.0.0.1', r));
    const keys = generateVapidKeys();
    t = await boot({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: 'mailto:ops@aven.test', WORKFLOW_ALLOW_PRIVATE_WEBHOOKS: 'true', WEB_ORIGIN: 'https://app.aven.test' });
    users = {}; for (const name of ['ann', 'bob', 'cat']) users[name] = await t.user(name);
    W = await t.workspace('ann'); await t.plan(W.id, 'ENTERPRISE'); for (const n of ['bob', 'cat']) await t.member(W.id, n, 'MEMBER');
    const { PushService } = await import('../../dist/push/push.service.js');
    pushService = t.get(PushService);
    ua = createECDH('prime256v1'); ua.generateKeys(); auth = randomBytes(16);
    sub = { endpoint: `http://127.0.0.1:${service.address().port}/push/abc`, keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
  });
  after(async () => { await t?.close(); await new Promise((r) => service.close(r)); });

  test('the browser learns the public key, and subscribing needs a valid subscription', async () => {
    const config = (await t.call('bob', 'GET', '/push/config')).body;
    assert.equal(config.enabled, true); assert.ok(config.publicKey);
    assert.equal((await t.call(null, 'GET', '/push/config')).status, 401);
    assert.equal((await t.call('bob', 'POST', '/push/subscriptions', { endpoint: 'nope' })).status, 400);
    assert.equal((await t.call('bob', 'POST', '/push/subscriptions', { endpoint: 'http://evil.example/x', keys: sub.keys })).status, 400);
    assert.equal((await t.call('bob', 'POST', '/push/subscriptions', { endpoint: sub.endpoint, keys: { p256dh: 'x', auth: 'y' } })).status, 400);
    assert.equal((await t.call('bob', 'POST', '/push/subscriptions', sub)).status, 200);
    assert.equal((await t.call('bob', 'POST', '/push/subscriptions', sub)).status, 200, 'subscribing twice is fine');
    assert.equal(await t.prisma.pushSubscription.count({ where: { userId: users.bob.id } }), 1);
  });

  test('a new assignment is pushed once, encrypted, with a VAPID header and a link to open', async () => {
    await assign('Ship it', 'bob');
    assert.deepEqual(await pushService.tick(), { pushes: 1, removed: 0 });
    assert.equal(received.length, 1);
    const [hit] = received;
    assert.equal(hit.url, '/push/abc'); assert.equal(hit.headers['content-encoding'], 'aes128gcm'); assert.match(hit.headers.authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/); assert.equal(hit.headers.ttl, '600');
    const message = decrypt(hit.body, ua, auth);
    assert.match(message.body, /assigned you .*Ship it|Ship it/); assert.match(message.url, /^https:\/\/app\.aven\.test\/workspace\/tasks\//);
    assert.deepEqual(await pushService.tick(), { pushes: 0, removed: 0 }, 'the same notification is never pushed twice');
  });

  test('several notifications collapse into one push, and a person is not pushed about their own actions', async () => {
    received.length = 0;
    await assign('One', 'bob'); await assign('Two', 'bob'); await assign('Mine', 'ann', 'ann');
    await pushService.tick();
    assert.equal(received.length, 1);
    assert.equal(decrypt(received[0].body, ua, auth).body, 'You have 2 new notifications.');
  });

  test('read notifications, people without a subscription and people who turned updates off get nothing', async () => {
    received.length = 0;
    await assign('For cat', 'cat');
    await assign('Read me', 'bob');
    const receipt = await t.prisma.activityReceipt.findFirstOrThrow({ where: { userId: users.bob.id, activity: { message: { contains: 'Read me' } } } });
    await t.call('bob', 'PATCH', `${ws()}/activity/${receipt.activityId}/read`, { read: true });
    assert.deepEqual(await pushService.tick(), { pushes: 0, removed: 0 });
    await t.call('bob', 'PATCH', '/session/me', { notifyTaskUpdates: false }); await assign('Quiet', 'bob');
    assert.deepEqual(await pushService.tick(), { pushes: 0, removed: 0 });
    await t.call('bob', 'PATCH', '/session/me', { notifyTaskUpdates: true });
  });

  test('a subscription the push service reports gone is removed; unsubscribing removes it too', async () => {
    status = 410; received.length = 0;
    await assign('Gone', 'bob');
    assert.deepEqual(await pushService.tick(), { pushes: 0, removed: 1 });
    assert.equal(await t.prisma.pushSubscription.count({ where: { userId: users.bob.id } }), 0);
    status = 201;
    await t.call('bob', 'POST', '/push/subscriptions', sub);
    assert.equal((await t.call('bob', 'DELETE', '/push/subscriptions', { endpoint: sub.endpoint })).status, 200);
    assert.equal(await t.prisma.pushSubscription.count({ where: { userId: users.bob.id } }), 0);
  });

  test('re-subscribing on a shared browser moves the device to the signed-in person', async () => {
    await t.call('bob', 'POST', '/push/subscriptions', sub);
    await t.call('cat', 'POST', '/push/subscriptions', sub);
    const rows = await t.prisma.pushSubscription.findMany({});
    assert.equal(rows.length, 1); assert.equal(rows[0].userId, users.cat.id);
  });

  test('a test notification goes only to the caller’s own devices, with fixed generic text; a gone device is cleaned up; no device is a clear error', async () => {
    // cat owns the subscription after the previous test.
    received.length = 0; status = 201;
    assert.equal((await t.call(null, 'POST', '/push/test')).status, 401);
    assert.equal((await t.call('ann', 'POST', '/push/test')).status, 400, 'a person with no device cannot test, and never reaches someone else’s');
    assert.equal(received.length, 0);
    const ok = await t.call('cat', 'POST', '/push/test'); assert.equal(ok.status, 200); assert.deepEqual(ok.body, { sent: 1, removed: 0, failed: 0 });
    const message = decrypt(received[0].body, ua, auth); assert.equal(message.title, 'AVEN.'); assert.match(message.body, /test notification/i); assert.match(message.url, /^https:\/\/app\.aven\.test\/workspace\/settings$/);
    status = 410;
    assert.deepEqual((await t.call('cat', 'POST', '/push/test')).body, { sent: 0, removed: 1, failed: 0 });
    assert.equal(await t.prisma.pushSubscription.count({ where: { userId: users.cat.id } }), 0, 'the expired subscription is gone'); status = 201;
  });
});
