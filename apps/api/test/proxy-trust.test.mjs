import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createRequire } from 'node:module';
import { RateLimitGuard } from '../dist/common/rate-limit.guard.js';
import { readApiEnvironment } from '../dist/config/api-environment.js';

const require = createRequire(import.meta.url);
const express = require('express');
const base = { DATABASE_URL: 'postgresql://a:b@localhost:5432/x' };

/** An API as the proxy would reach it, run with the given TRUST_PROXY setting. Every request here connects from 127.0.0.1. */
async function seenAs(trust, headers) {
  const app = express(); app.set('trust proxy', trust);
  app.get('/ip', (request, response) => response.json({ ip: request.ip }));
  const server = createServer(app); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { return (await (await fetch(`http://127.0.0.1:${server.address().port}/ip`, { headers })).json()).ip; } finally { server.close(); }
}
const loopback = (ip) => ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';

test('security: with no proxy trusted, forwarding headers are ignored completely', async () => {
  for (const headers of [{ 'x-forwarded-for': '6.6.6.6' }, { 'x-forwarded-for': '6.6.6.6, 7.7.7.7' }, { forwarded: 'for=6.6.6.6' }, { 'x-real-ip': '6.6.6.6' }]) assert.ok(loopback(await seenAs(false, headers)), JSON.stringify(headers));
});

test('security: with one trusted proxy, only the address that proxy added counts, never the ones a client put in front', async () => {
  assert.equal(await seenAs(1, { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }), '203.0.113.9');
  assert.equal(await seenAs(1, { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3, 203.0.113.9' }), '203.0.113.9');
  assert.equal(await seenAs(1, { 'x-forwarded-for': '6.6.6.6', forwarded: 'for=8.8.8.8' }), '6.6.6.6', 'the Forwarded header is not used at all; only X-Forwarded-For');
});

test('security: a proxy list ignores forwarding headers from any connection that is not a listed proxy', async () => {
  assert.ok(loopback(await seenAs(['10.0.0.0/8'], { 'x-forwarded-for': '6.6.6.6' })), 'a direct connection from outside the list cannot choose its address');
  assert.equal(await seenAs(['loopback'], { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }), '203.0.113.9');
});

test('the rate limit ignores values that are not IP addresses, so garbage cannot buy a fresh allowance', () => {
  const guard = new RateLimitGuard(2, 1000, () => 0);
  const call = (ip) => guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ ip, socket: { remoteAddress: '9.9.9.9' }, path: '/api/v1/x', headers: {} }), getResponse: () => ({ setHeader() {} }) }) });
  for (const junk of ['<script>', 'a'.repeat(200), 'unknown', '1.2.3']) { try { call(junk); } catch { /* the third call is refused below */ } }
  assert.throws(() => call('also not an ip'), /Too many requests/, 'all of them counted against the real connection');
});

test('TRUST_PROXY accepts a count or a list of proxy addresses, and production refuses true', () => {
  assert.equal(readApiEnvironment({ ...base, TRUST_PROXY: '1' }).trustProxy, 1);
  assert.deepEqual(readApiEnvironment({ ...base, TRUST_PROXY: 'loopback, 10.0.0.0/8, fd00::/8, 192.168.1.5' }).trustProxy, ['loopback', '10.0.0.0/8', 'fd00::/8', '192.168.1.5']);
  for (const bad of ['10.0.0.0/33', 'banana', '1.2.3.4/8/9', 'fd00::/129']) assert.throws(() => readApiEnvironment({ ...base, TRUST_PROXY: bad }), /TRUST_PROXY/, bad);
  assert.equal(readApiEnvironment({ ...base, TRUST_PROXY: 'true' }).trustProxy, true, 'allowed for local testing');
  assert.throws(() => readApiEnvironment({ ...base, NODE_ENV: 'production', CLERK_ISSUER: 'https://x.clerk.accounts.dev', CLERK_SECRET_KEY: 'k', TRUST_PROXY: 'true' }), /TRUST_PROXY=true/);
});

test('production refuses the development database passwords', () => {
  const prod = { NODE_ENV: 'production', CLERK_ISSUER: 'https://x.clerk.accounts.dev', CLERK_SECRET_KEY: 'k' };
  for (const password of ['aven-local-only', 'aven_ci', 'postgres', 'password']) assert.throws(() => readApiEnvironment({ ...prod, DATABASE_URL: `postgresql://aven:${password}@db:5432/aven` }), /development password/, password);
  assert.doesNotThrow(() => readApiEnvironment({ ...prod, DATABASE_URL: 'postgresql://aven:v3ry-l0ng-and-random@db:5432/aven' }));
  assert.doesNotThrow(() => readApiEnvironment({ DATABASE_URL: 'postgresql://aven:aven-local-only@localhost:5432/aven' }), 'fine for local development');
});
