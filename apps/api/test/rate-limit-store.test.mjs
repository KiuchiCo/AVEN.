import assert from 'node:assert/strict';
import test from 'node:test';
import { RateLimitGuard } from '../dist/common/rate-limit.guard.js';
import { readApiEnvironment } from '../dist/config/api-environment.js';

const call = (guard, request) => guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ path: '/api/v1/x', headers: {}, ...request }), getResponse: () => ({ setHeader() {} }) }) });
const memoryStore = () => { const rows = new Map(); return { async hit(key, windowMs, now) { let row = rows.get(key); if (!row || row.resetAt <= now) { row = { count: 0, resetAt: now + windowMs }; rows.set(key, row); } row.count += 1; return { ...row }; } }; };

test('security: two accounts behind one address do not share an allowance, and one account cannot dodge it by changing address', () => {
  const guard = new RateLimitGuard(2, 1000, () => 0);
  const alice = (ip) => ({ ip, authenticatedIdentity: { issuer: 'i', subject: 'alice' } });
  const bob = { ip: '9.9.9.9', authenticatedIdentity: { issuer: 'i', subject: 'bob' } };
  assert.equal(call(guard, alice('9.9.9.9')), true); assert.equal(call(guard, alice('8.8.8.8')), true);
  assert.throws(() => call(guard, alice('7.7.7.7')), /Too many requests/);
  assert.equal(call(guard, bob), true, 'someone else on the same address is unaffected');
});

test('security: with a shared store, instances count together, so the limit holds however many there are', async () => {
  const store = memoryStore(); RateLimitGuard.shared = store;
  try {
    const one = new RateLimitGuard(3, 1000, () => 0); const two = new RateLimitGuard(3, 1000, () => 0);
    const who = { ip: '5.5.5.5' };
    assert.equal(await call(one, who), true); assert.equal(await call(two, who), true); assert.equal(await call(one, who), true);
    await assert.rejects(async () => call(two, who), /Too many requests/, 'the fourth request is refused even though it reached a different instance');
  } finally { RateLimitGuard.shared = null; }
});

test('a failing shared store falls back to counting on this instance instead of failing requests or counting nothing', async () => {
  RateLimitGuard.shared = { hit: async () => { throw new Error('database down'); } };
  try {
    const guard = new RateLimitGuard(2, 1000, () => 0);
    assert.equal(await call(guard, { ip: '6.6.6.6' }), true); assert.equal(await call(guard, { ip: '6.6.6.6' }), true);
    await assert.rejects(async () => call(guard, { ip: '6.6.6.6' }), /Too many requests/);
  } finally { RateLimitGuard.shared = null; }
});

test('RATE_LIMIT_STORE is memory or postgres', () => {
  const base = { DATABASE_URL: 'postgresql://a:b@localhost:5432/x' };
  assert.equal(readApiEnvironment(base).rateLimitStore, 'memory');
  assert.equal(readApiEnvironment({ ...base, RATE_LIMIT_STORE: 'postgres' }).rateLimitStore, 'postgres');
  assert.throws(() => readApiEnvironment({ ...base, RATE_LIMIT_STORE: 'redis' }), /RATE_LIMIT_STORE/);
});

test('security: sensitive routes refuse (503) when the shared store is down or too slow, instead of counting loosely', async () => {
  const original = RateLimitGuard.storeTimeoutMs; RateLimitGuard.storeTimeoutMs = 50;
  try {
    for (const broken of [{ hit: async () => { throw new Error('connection refused'); } }, { hit: () => new Promise(() => {}) }]) {
      RateLimitGuard.shared = broken;
      await assert.rejects(async () => call(RateLimitGuard.strict(5), { ip: '4.4.4.4' }), (error) => error.getStatus?.() === 503, 'strict route');
      assert.equal(await call(new RateLimitGuard(5, 1000, () => 0), { ip: '4.4.4.4' }), true, 'an ordinary route keeps working on this instance’s own count');
    }
    RateLimitGuard.shared = memoryStore();
    const strict = RateLimitGuard.strict(2);
    assert.equal(await call(strict, { ip: '4.4.4.5' }), true); assert.equal(await call(strict, { ip: '4.4.4.5' }), true);
    await assert.rejects(async () => call(strict, { ip: '4.4.4.5' }), /Too many requests/, 'and with the store healthy it limits as normal');
  } finally { RateLimitGuard.shared = null; RateLimitGuard.storeTimeoutMs = original; }
});
