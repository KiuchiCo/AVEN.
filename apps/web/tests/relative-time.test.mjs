import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ago, dueDay } from '../app/workspace/relative-time.ts';

const now = Date.parse('2026-03-10T12:00:00Z');
test('relative times read naturally', () => {
  assert.equal(ago(new Date(now - 20_000), now, 'en'), 'now'); assert.equal(ago(new Date(now - 5 * 60_000), now, 'en'), '5 min. ago');
  assert.equal(ago(new Date(now - 2 * 3_600_000), now, 'en'), '2 hr. ago'); assert.equal(ago(new Date(now - 30 * 3_600_000), now, 'en'), 'yesterday');
  assert.equal(ago(new Date(now - 3 * 86_400_000), now, 'en'), '3 days ago'); assert.match(ago(new Date(now - 20 * 86_400_000), now, 'en'), /\d/);
});
test('relative times follow the reader’s language', () => {
  assert.equal(ago(new Date(now - 30 * 3_600_000), now, 'de'), 'gestern');
  assert.equal(ago(new Date(now - 3 * 86_400_000), now, 'fr'), 'il y a 3 jours');
  assert.equal(ago(new Date(now - 3 * 86_400_000), now, 'es'), 'hace 3 días');
});
test('due days say today, tomorrow or yesterday, and mark overdue dates', () => {
  const today = new Date(2026, 2, 10, 9);
  assert.deepEqual(dueDay('2026-03-10', today, 'en'), { label: 'Today', overdue: false });
  assert.deepEqual(dueDay('2026-03-11', today, 'en'), { label: 'Tomorrow', overdue: false });
  assert.deepEqual(dueDay('2026-03-09', today, 'en'), { label: 'Yesterday', overdue: true });
  assert.equal(dueDay('2026-02-23', today, 'en').overdue, true);
  assert.match(dueDay('2026-02-23', today, 'en').label, /23/);
  assert.equal(dueDay('2026-03-11', today, 'de').label, 'Morgen');
});
