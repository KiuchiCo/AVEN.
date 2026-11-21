import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('security: the shared rate-limit store', { skip }, () => {
  let t; let PostgresRateLimitStore;
  before(async () => { t = await boot(); ({ PostgresRateLimitStore } = await import('../../dist/common/rate-limit.store.js')); });
  after(async () => { await t?.close(); });

  test('two instances over one database count together, windows reset, and keys are separate', async () => {
    const one = new PostgresRateLimitStore(t.prisma); const two = new PostgresRateLimitStore(t.prisma);
    const key = `test:${t.run}`; const T = 1_800_000_000_000;
    assert.equal((await one.hit(key, 1000, T)).count, 1);
    assert.equal((await two.hit(key, 1000, T + 10)).count, 2);
    assert.equal((await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? one : two).hit(key, 1000, T + 20)))).map((hit) => hit.count).sort((a, b) => a - b).join(), '3,4,5,6,7,8,9,10', 'concurrent requests are all counted, none twice');
    assert.equal((await one.hit(`other:${t.run}`, 1000, T)).count, 1);
    assert.equal((await two.hit(key, 1000, T + 1500)).count, 1, 'a new window starts at one');
  });
});
