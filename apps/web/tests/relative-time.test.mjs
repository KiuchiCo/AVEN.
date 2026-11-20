import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ago, greeting } from '../app/workspace/relative-time.ts';

const now = Date.parse('2026-03-10T12:00:00Z');
test('relative times read naturally', () => {
  assert.equal(ago(new Date(now - 20_000), now), 'just now'); assert.equal(ago(new Date(now - 5 * 60_000), now), '5m ago');
  assert.equal(ago(new Date(now - 2 * 3_600_000), now), '2h ago'); assert.equal(ago(new Date(now - 30 * 3_600_000), now), 'yesterday');
  assert.equal(ago(new Date(now - 3 * 86_400_000), now), '3 days ago'); assert.match(ago(new Date(now - 20 * 86_400_000), now), /\d/);
});
test('the greeting follows the hour', () => { assert.deepEqual([0, 11, 12, 17, 18, 23].map(greeting), ['Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening']); });
