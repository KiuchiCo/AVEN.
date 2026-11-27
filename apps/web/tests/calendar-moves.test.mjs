import assert from 'node:assert/strict';
import { test } from 'node:test';
import { durationMinutes, moveToDate, moveToHour, pixelsToMinutes, resizeBy } from '../app/workspace/calendar-moves.ts';

// Wall-clock helpers in the test process's own time zone, like the browser.
const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const clock = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

test('moving to another day keeps the time of day and the length', () => {
  const span = { startsAt: local(2026, 11, 12, 9, 30), endsAt: local(2026, 11, 12, 11, 0) };
  const moved = moveToDate(span, '2026-11-20');
  assert.equal(clock(moved.startsAt), '2026-11-20 09:30'); assert.equal(clock(moved.endsAt), '2026-11-20 11:00');
  assert.equal(moveToDate({ startsAt: span.startsAt, endsAt: null }, '2026-11-20').endsAt, null, 'an event without an end gets none');
});

test('moving across a month and year boundary', () => {
  const moved = moveToDate({ startsAt: local(2026, 12, 31, 23, 0), endsAt: local(2027, 1, 1, 0, 30) }, '2027-02-01');
  assert.equal(clock(moved.startsAt), '2027-02-01 23:00'); assert.equal(clock(moved.endsAt), '2027-02-02 00:30');
});

test('moving to an hour in the day view keeps the minutes and the length', () => {
  const moved = moveToHour({ startsAt: local(2026, 11, 12, 9, 15), endsAt: local(2026, 11, 12, 9, 45) }, '2026-11-13', 14);
  assert.equal(clock(moved.startsAt), '2026-11-13 14:15'); assert.equal(clock(moved.endsAt), '2026-11-13 14:45');
});

test('resizing snaps to 15 minutes, never goes below 15 minutes, never past midnight', () => {
  const span = { startsAt: local(2026, 11, 12, 9, 0), endsAt: local(2026, 11, 12, 10, 0) };
  assert.equal(clock(resizeBy(span, 37).endsAt), '2026-11-12 10:30', '37 minutes rounds to 30');
  assert.equal(clock(resizeBy(span, -120).endsAt), '2026-11-12 09:15', 'at least 15 minutes');
  assert.equal(clock(resizeBy(span, 24 * 60).endsAt), '2026-11-13 00:00', 'stops at the end of the day');
  assert.equal(clock(resizeBy({ startsAt: span.startsAt, endsAt: null }, 30).endsAt), '2026-11-12 10:30', 'an open-ended event counts as an hour');
  assert.equal(durationMinutes(span), 60);
});

test('vertical drag distance becomes snapped minutes', () => {
  assert.equal(pixelsToMinutes(60, 60), 60); assert.equal(pixelsToMinutes(20, 60), 15); assert.equal(pixelsToMinutes(-31, 60), -30); assert.equal(pixelsToMinutes(10, 0), 0);
});

test('wall-clock times survive a daylight-saving change (Sydney, April and October)', { skip: Intl.DateTimeFormat().resolvedOptions().timeZone === 'UTC' ? 'needs a time zone with daylight saving (run with TZ=Australia/Sydney)' : false }, () => {
  // 9:00 the day before the change, moved to the day after: still 9:00, still an hour long.
  const before = { startsAt: local(2026, 4, 4, 9, 0), endsAt: local(2026, 4, 4, 10, 0) };
  const after = moveToDate(before, '2026-04-06');
  assert.equal(clock(after.startsAt), '2026-04-06 09:00'); assert.equal(clock(after.endsAt), '2026-04-06 10:00');
  const spring = moveToDate({ startsAt: local(2026, 10, 3, 9, 0), endsAt: local(2026, 10, 3, 10, 0) }, '2026-10-05');
  assert.equal(clock(spring.startsAt), '2026-10-05 09:00'); assert.equal(clock(spring.endsAt), '2026-10-05 10:00');
});
