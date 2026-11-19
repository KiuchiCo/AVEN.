import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseIcs, zonedToUtc } from '../dist/productivity/ics.js';

const wrap = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flatMap((lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
const one = (...lines) => parseIcs(wrap(lines));

test('a UTC event keeps its times, text and escapes', () => {
  const { events } = one('UID:a@x', 'SUMMARY:Planning\\, Q4', 'DTSTART:20261201T090000Z', 'DTEND:20261201T100000Z', 'DESCRIPTION:Line one\\nLine two\; done', 'LOCATION:Room 4');
  assert.equal(events.length, 1);
  assert.deepEqual([events[0].uid, events[0].title, events[0].description, events[0].location], ['a@x', 'Planning, Q4', 'Line one\nLine two; done', 'Room 4']);
  assert.equal(events[0].startsAt.toISOString(), '2026-12-01T09:00:00.000Z');
  assert.equal(events[0].endsAt.toISOString(), '2026-12-01T10:00:00.000Z');
  assert.equal(events[0].isAllDay, false);
});

test('local times with a time zone are converted, including daylight saving', () => {
  assert.equal(one('UID:s', 'SUMMARY:Sydney', 'DTSTART;TZID=Australia/Sydney:20261201T090000').events[0].startsAt.toISOString(), '2026-11-30T22:00:00.000Z');
  assert.equal(one('UID:s', 'SUMMARY:Sydney winter', 'DTSTART;TZID=Australia/Sydney:20260701T090000').events[0].startsAt.toISOString(), '2026-06-30T23:00:00.000Z');
  assert.equal(one('UID:n', 'SUMMARY:NY', 'DTSTART;TZID=America/New_York:20261201T090000').events[0].startsAt.toISOString(), '2026-12-01T14:00:00.000Z');
  assert.equal(zonedToUtc(Date.UTC(2026, 11, 1, 9), 'Not/AZone'), null);
});

test('unknown (for example Windows-style) zone names are skipped with a reason, not guessed', () => {
  const result = one('UID:w', 'SUMMARY:Outlook meeting', 'DTSTART;TZID=Pacific Standard Time:20261201T090000');
  assert.equal(result.events.length, 0);
  assert.match(result.skipped[0].reason, /unrecognised time zone “Pacific Standard Time”/);
  assert.equal(result.skipped[0].title, 'Outlook meeting');
});

test('all-day events: single day has no end, multi-day end is inclusive', () => {
  const single = one('UID:d', 'SUMMARY:Holiday', 'DTSTART;VALUE=DATE:20261225', 'DTEND;VALUE=DATE:20261226').events[0];
  assert.equal(single.isAllDay, true);
  assert.equal(single.startsAt.toISOString(), '2026-12-25T12:00:00.000Z');
  assert.equal(single.endsAt, null);
  const multi = one('UID:m', 'SUMMARY:Trip', 'DTSTART;VALUE=DATE:20261220', 'DTEND;VALUE=DATE:20261223').events[0];
  assert.equal(multi.endsAt.toISOString(), '2026-12-22T12:00:00.000Z');
});

test('folded lines are joined and alarms are ignored', () => {
  const { events } = parseIcs(['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:f', 'SUMMARY:A very long', '  title here', 'DTSTART:20261201T090000Z', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder text', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\n'));
  assert.equal(events[0].title, 'A very long title here');
  assert.equal(events[0].description, null);
});

test('simple repeats are imported with their zone and end date', () => {
  const event = one('UID:r', 'SUMMARY:Standup', 'DTSTART;TZID=Australia/Sydney:20261201T090000', 'RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20270301T000000Z').events[0];
  assert.deepEqual([event.recurrence, event.recurrenceInterval, event.recurrenceTimeZone], ['WEEKLY', 2, 'Australia/Sydney']);
  assert.equal(event.recurrenceUntil.toISOString(), '2027-03-01T00:00:00.000Z');
});

test('a repeat with no end date is limited to two years and noted', () => {
  const result = one('UID:r', 'SUMMARY:Forever', 'DTSTART:20261201T090000Z', 'RRULE:FREQ=DAILY');
  assert.equal(result.events[0].recurrenceUntil.toISOString(), '2028-12-01T09:00:00.000Z');
  assert.equal(result.events[0].recurrenceTimeZone, 'UTC');
  assert.ok(result.notes.some((note) => /two years/.test(note)));
});

test('repeat rules AVEN cannot represent are skipped, never imported as one-offs', () => {
  for (const [rule, pattern] of [['FREQ=WEEKLY;BYDAY=MO,WE', /BYDAY/], ['FREQ=DAILY;COUNT=5', /COUNT/], ['FREQ=YEARLY', /yearly/], ['FREQ=DAILY;INTERVAL=30', /interval/]]) {
    const result = one('UID:x', 'SUMMARY:Complex', 'DTSTART:20261201T090000Z', `RRULE:${rule}`);
    assert.equal(result.events.length, 0, rule);
    assert.match(result.skipped[0].reason, pattern);
  }
});

test('excluded dates, edited occurrences and cancelled events are skipped', () => {
  const result = parseIcs(wrap(
    ['UID:e', 'SUMMARY:Has exception', 'DTSTART:20261201T090000Z', 'RRULE:FREQ=DAILY;UNTIL=20261210T090000Z', 'EXDATE:20261203T090000Z'],
    ['UID:o', 'SUMMARY:Moved one', 'RECURRENCE-ID:20261204T090000Z', 'DTSTART:20261204T110000Z'],
    ['UID:c', 'SUMMARY:Cancelled', 'STATUS:CANCELLED', 'DTSTART:20261205T090000Z'],
    ['UID:n', 'SUMMARY:No start'],
  ));
  assert.equal(result.events.length, 0);
  assert.deepEqual(result.skipped.map((item) => item.title), ['Has exception', 'Moved one', 'Cancelled', 'No start']);
});

test('events without a UID get a stable generated one so re-importing still matches', () => {
  const lines = ['SUMMARY:No uid', 'DTSTART:20261201T090000Z'];
  const first = one(...lines).events[0].uid;
  assert.match(first, /^noid-[0-9a-f]{32}$/);
  assert.equal(one(...lines).events[0].uid, first);
  assert.notEqual(one('SUMMARY:No uid', 'DTSTART:20261202T090000Z').events[0].uid, first);
});

test('floating times are read as UTC and noted; duplicate UIDs keep the last; junk yields nothing', () => {
  const floating = one('UID:f', 'SUMMARY:Floating', 'DTSTART:20261201T090000');
  assert.equal(floating.events[0].startsAt.toISOString(), '2026-12-01T09:00:00.000Z');
  assert.ok(floating.notes.some((note) => /UTC/.test(note)));
  const dupes = parseIcs(wrap(['UID:d', 'SUMMARY:First', 'DTSTART:20261201T090000Z'], ['UID:d', 'SUMMARY:Second', 'DTSTART:20261201T090000Z']));
  assert.deepEqual(dupes.events.map((event) => event.title), ['Second']);
  assert.deepEqual(parseIcs('not a calendar at all'), { events: [], skipped: [], notes: [] });
});

test('an end time that is not after the start is dropped; long fields are trimmed', () => {
  assert.equal(one('UID:z', 'SUMMARY:Zero', 'DTSTART:20261201T090000Z', 'DTEND:20261201T090000Z').events[0].endsAt, null);
  const long = one('UID:l', `SUMMARY:${'x'.repeat(300)}`, 'DTSTART:20261201T090000Z', `LOCATION:${'y'.repeat(400)}`).events[0];
  assert.equal(long.title.length, 200);
  assert.equal(long.location.length, 250);
});
