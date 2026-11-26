import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProfileCache } from '../dist/auth/profile-cache.js';

test('a sign-in profile is reused for a few minutes, then asked for again', () => {
  let now = 1_000; const cache = new ProfileCache(5 * 60_000, 10, () => now);
  assert.equal(cache.get('user_1'), null);
  cache.set('user_1', { email: 'a@example.com', fullName: 'Ada' });
  assert.deepEqual(cache.get('user_1'), { email: 'a@example.com', fullName: 'Ada' });
  now += 5 * 60_000 - 1; assert.ok(cache.get('user_1'), 'still fresh just before the limit');
  now += 1; assert.equal(cache.get('user_1'), null, 'expired at the limit');
});

test('the cache never grows past its limit, dropping the oldest person first', () => {
  const cache = new ProfileCache(60_000, 2, () => 0);
  cache.set('a', { email: 'a@x', fullName: null }); cache.set('b', { email: 'b@x', fullName: null }); cache.set('c', { email: 'c@x', fullName: null });
  assert.equal(cache.get('a'), null); assert.ok(cache.get('b')); assert.ok(cache.get('c'));
  cache.forget('b'); assert.equal(cache.get('b'), null);
});
