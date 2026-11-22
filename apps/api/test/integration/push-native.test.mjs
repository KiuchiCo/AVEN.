import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import http2 from 'node:http2';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('native (iPhone and iPad) push', { skip }, () => {
  let t; let W; let apple; let sent; let status; let users; let push;
  const tok = (c) => c.repeat(64);
  before(async () => {
    sent = []; status = 200;
    apple = http2.createServer();
    apple.on('stream', (s, h) => { let b = ''; s.on('data', (c) => { b += c; }); s.on('end', () => { sent.push({ path: h[':path'], body: JSON.parse(b) }); s.respond({ ':status': status }); s.end(status === 410 ? '{"reason":"Unregistered"}' : ''); }); });
    await new Promise((r) => apple.listen(0, '127.0.0.1', r));
    const pem = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    t = await boot({ APNS_KEY_ID: 'ABCDE12345', APNS_TEAM_ID: 'TEAM123456', APNS_PRIVATE_KEY: pem, APNS_BASE_URL: `http://127.0.0.1:${apple.address().port}`, WEB_ORIGIN: 'https://app.aven.test' });
    users = {}; for (const n of ['ann', 'bob']) users[n] = await t.user(n);
    W = await t.workspace('ann'); await t.plan(W.id, 'ENTERPRISE'); await t.member(W.id, 'bob', 'MEMBER');
    push = t.get((await import('../../dist/push/push.service.js')).PushService);
  });
  after(async () => { await t?.close(); apple.closeAllConnections?.(); await new Promise((r) => apple.close(r)); });

  test('registering needs sign-in and a valid token, and a user keeps at most ten devices', async () => {
    assert.equal((await t.call(null, 'POST', '/push/devices', { token: tok('a') })).status, 401);
    assert.equal((await t.call('bob', 'POST', '/push/devices', { token: 'nope' })).status, 400);
    assert.equal((await t.call('bob', 'GET', '/push/config')).body.native, true);
    for (let i = 0; i < 10; i++) assert.equal((await t.call('bob', 'POST', '/push/devices', { token: String(i).repeat(64), environment: 'development' })).status, 200);
    assert.equal((await t.call('bob', 'POST', '/push/devices', { token: tok('f') })).status, 400);
    for (let i = 0; i < 10; i++) await t.call('bob', 'DELETE', '/push/devices', { token: String(i).repeat(64) });
  });

  test('a device moves to whoever signed in last, and unregister works without a session', async () => {
    await t.call('ann', 'POST', '/push/devices', { token: tok('b') });
    await t.call('bob', 'POST', '/push/devices', { token: tok('b') });
    assert.equal((await t.call(null, 'POST', '/push/devices/unregister', { token: tok('b') })).status, 200);
  });

  test('an assignment reaches the device through Apple, and a dead token is forgotten', async () => {
    await t.call('bob', 'POST', '/push/devices', { token: tok('c'), environment: 'production' });
    await t.call('ann', 'POST', `/workspaces/${W.id}/tasks`, { title: 'Ship it', assigneeId: users.bob.id });
    const r = await push.tick(new Date());
    assert.ok(r.pushes >= 1);
    assert.equal(sent.at(-1).path, `/3/device/${tok('c')}`);
    assert.match(sent.at(-1).body.path, /^\/workspace/);
    status = 410;
    await t.call('ann', 'POST', `/workspaces/${W.id}/tasks`, { title: 'Again', assigneeId: users.bob.id });
    const r2 = await push.tick(new Date());
    assert.ok(r2.removed >= 1);
    assert.equal((await t.call('bob', 'DELETE', '/push/devices', { token: tok('c') })).status, 200);
  });
});
