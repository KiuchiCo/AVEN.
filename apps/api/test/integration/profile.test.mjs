import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('profile time zone', { skip }, () => {
  let t;
  before(async () => { t = await boot(); await t.user('zoe'); });
  after(async () => { await t?.close(); });

  test('a person can choose a real time zone, clear it, and cannot save a made-up one', async () => {
    const set = await t.call('zoe', 'PATCH', '/session/me', { timeZone: 'Australia/Sydney' });
    assert.equal(set.status, 200, JSON.stringify(set.body)); assert.equal(set.body.timeZone, 'Australia/Sydney');
    assert.equal((await t.call('zoe', 'GET', '/session/me')).body.timeZone, 'Australia/Sydney');
    assert.equal((await t.call('zoe', 'PATCH', '/session/me', { timeZone: 'Mars/Olympus' })).status, 400);
    assert.equal((await t.call('zoe', 'GET', '/session/me')).body.timeZone, 'Australia/Sydney', 'a refused change changes nothing');
    assert.equal((await t.call('zoe', 'PATCH', '/session/me', { timeZone: null })).body.timeZone, null);
  });
});
