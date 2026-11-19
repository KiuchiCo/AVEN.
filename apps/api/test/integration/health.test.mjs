import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('health', { skip }, () => {
  let t;
  before(async () => { t = await boot(); });
  after(async () => { await t?.close(); });
  test('liveness and readiness answer without signing in, and readiness reflects the database', async () => {
    assert.equal((await t.call(null, 'GET', '/health')).body.status, 'ok');
    const ready = await t.call(null, 'GET', '/health/ready');
    assert.equal(ready.status, 200); assert.equal(ready.body.status, 'ready');
  });
});
