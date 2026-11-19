import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { nextDueDate, parseRecurrence } from '../dist/productivity/task-rules.js';

const d = (iso) => new Date(iso);
const iso = (date) => date.toISOString().slice(0, 10);
const longAgo = d('2000-01-01T00:00:00Z');

test('daily, weekly and monthly steps move forward by the interval', () => {
  assert.equal(iso(nextDueDate(d('2026-11-19T09:00:00Z'), 'DAILY', 1, longAgo)), '2026-11-20');
  assert.equal(iso(nextDueDate(d('2026-11-19T09:00:00Z'), 'DAILY', 3, longAgo)), '2026-11-22');
  assert.equal(iso(nextDueDate(d('2026-11-19T09:00:00Z'), 'WEEKLY', 2, longAgo)), '2026-12-03');
  assert.equal(iso(nextDueDate(d('2026-11-19T09:00:00Z'), 'MONTHLY', 1, longAgo)), '2026-12-19');
});

test('the time of day is preserved', () => {
  assert.equal(nextDueDate(d('2026-11-19T09:30:00Z'), 'DAILY', 1, longAgo).toISOString(), '2026-11-20T09:30:00.000Z');
});

test('month ends are clamped and recover within a call', () => {
  assert.equal(iso(nextDueDate(d('2026-01-31T00:00:00Z'), 'MONTHLY', 1, longAgo)), '2026-02-28');
  assert.equal(iso(nextDueDate(d('2028-01-31T00:00:00Z'), 'MONTHLY', 1, longAgo)), '2028-02-29');
  assert.equal(iso(nextDueDate(d('2026-01-31T00:00:00Z'), 'MONTHLY', 2, longAgo)), '2026-03-31');
  assert.equal(iso(nextDueDate(d('2026-12-15T00:00:00Z'), 'MONTHLY', 1, longAgo)), '2027-01-15');
});

test('finishing late skips the backlog: the next date is after "now"', () => {
  assert.equal(iso(nextDueDate(d('2026-11-01T00:00:00Z'), 'WEEKLY', 1, d('2026-11-19T12:00:00Z'))), '2026-11-22');
  assert.equal(iso(nextDueDate(d('2026-11-01T00:00:00Z'), 'DAILY', 1, d('2026-11-19T12:00:00Z'))), '2026-11-20');
});

test('finishing early still moves past the current due date', () => {
  assert.equal(iso(nextDueDate(d('2026-12-01T00:00:00Z'), 'WEEKLY', 1, d('2026-11-19T12:00:00Z'))), '2026-12-08');
});

test('parseRecurrence reads only the fields that were sent', () => {
  assert.deepEqual(parseRecurrence({ title: 'x' }), {});
  assert.deepEqual(parseRecurrence({ recurrence: 'WEEKLY', recurrenceInterval: 2 }), { recurrence: 'WEEKLY', recurrenceInterval: 2 });
  const until = parseRecurrence({ recurrence: 'DAILY', recurrenceUntil: '2027-01-01T00:00:00Z' });
  assert.equal(until.recurrenceUntil.toISOString(), '2027-01-01T00:00:00.000Z');
});

test('turning repeat off resets the interval and end date', () => {
  assert.deepEqual(parseRecurrence({ recurrence: null }), { recurrence: null, recurrenceInterval: 1, recurrenceUntil: null });
  assert.deepEqual(parseRecurrence({ recurrence: '', recurrenceUntil: '2027-01-01' }), { recurrence: null, recurrenceInterval: 1, recurrenceUntil: null });
});

test('invalid repeat settings are rejected', () => {
  for (const body of [{ recurrence: 'YEARLY' }, { recurrence: 5 }, { recurrenceInterval: 0 }, { recurrenceInterval: 366 }, { recurrenceInterval: 1.5 }, { recurrenceInterval: '2' }, { recurrence: 'DAILY', recurrenceUntil: 'soon' }]) {
    assert.throws(() => parseRecurrence(body), BadRequestException, JSON.stringify(body));
  }
});

test('a task cannot start after it is due, and missing dates are fine', async () => {
  const { assertDateOrder } = await import('../dist/productivity/task-rules.js');
  const d = (s) => new Date(s);
  assert.doesNotThrow(() => assertDateOrder(d('2026-01-01'), d('2026-01-01')));
  assert.doesNotThrow(() => assertDateOrder(null, d('2026-01-01')));
  assert.doesNotThrow(() => assertDateOrder(d('2026-01-01'), null));
  assert.throws(() => assertDateOrder(d('2026-01-02'), d('2026-01-01')), /start date/);
});
