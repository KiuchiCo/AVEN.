import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { sendWebhook, WebhookError } from '../dist/workflows/webhook.js';

async function target(handler, run) {
  const requests = [];
  const server = createServer((req, res) => { let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => { requests.push({ method: req.method, url: req.url, headers: req.headers, body }); handler(req, res); }); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { return await run(`http://localhost:${server.address().port}`, requests); } finally { server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve)); }
}
const fails = async (promise, retry, pattern) => assert.rejects(promise, (error) => error instanceof WebhookError && error.retry === retry && (!pattern || pattern.test(error.message)));

test('a webhook is POSTed as JSON with a clear user agent', async () => {
  await target((req, res) => res.writeHead(204).end(), async (base, requests) => {
    assert.deepEqual(await sendWebhook(new URL(`${base}/hook?a=1`), '{"x":1}', { allowPrivate: true }), { status: 204 });
    assert.deepEqual([requests[0].method, requests[0].url, requests[0].body, requests[0].headers['content-type'], requests[0].headers['user-agent']], ['POST', '/hook?a=1', '{"x":1}', 'application/json', 'AVEN-Workflows/1.0']);
  });
});

test('the address a name resolves to is checked when connecting, so internal hosts are never reached', async () => {
  await target((req, res) => res.writeHead(200).end(), async (base, requests) => {
    await fails(sendWebhook(new URL(`${base}/x`), '{}', { allowPrivate: false }), false, /internal network/);
    assert.equal(requests.length, 0, 'no request may reach the internal server');
    await fails(sendWebhook(new URL(`http://127.0.0.1:${new URL(base).port}/x`), '{}', { allowPrivate: false }), false, /internal network/);
    assert.equal(requests.length, 0);
  });
});

test('server errors and rate limits are worth retrying; client errors and redirects are not', async () => {
  for (const [status, retry] of [[500, true], [502, true], [503, true], [429, true], [408, true], [400, false], [401, false], [404, false], [410, false], [301, false], [302, false]]) {
    await target((req, res) => res.writeHead(status, status >= 300 && status < 400 ? { location: '/elsewhere' } : {}).end(), async (base, requests) => {
      await fails(sendWebhook(new URL(`${base}/x`), '{}', { allowPrivate: true }), retry, new RegExp(`HTTP ${status}`));
      assert.equal(requests.length, 1, `HTTP ${status} must not be followed`);
    });
  }
});

test('a slow webhook times out and can be retried; an unreachable one can be retried', async () => {
  await target(() => { /* never answers */ }, async (base) => { await fails(sendWebhook(new URL(`${base}/x`), '{}', { allowPrivate: true, timeoutMs: 200 }), true, /in time/); });
  await fails(sendWebhook(new URL('http://127.0.0.1:1/x'), '{}', { allowPrivate: true }), true, /could not be reached/);
});

test('a name that does not exist is a permanent failure', async () => {
  await fails(sendWebhook(new URL('https://no-such-host.invalid/x'), '{}', { allowPrivate: false }), false);
});

test('huge responses do not hang or crash the sender', async () => {
  await target((req, res) => { res.writeHead(200); res.write(Buffer.alloc(200 * 1024)); res.end(Buffer.alloc(200 * 1024)); }, async (base) => {
    assert.equal((await sendWebhook(new URL(`${base}/x`), '{}', { allowPrivate: true })).status, 200);
  });
});
