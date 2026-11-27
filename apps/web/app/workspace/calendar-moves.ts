/**
 * Date maths for moving and resizing calendar events. Times are kept as local wall-clock times: an event at 9:00 moved to a day on the
 * other side of a daylight-saving change is still at 9:00, and its length in minutes stays the same.
 */
export type Span = { startsAt: string; endsAt: string | null; isAllDay?: boolean };
export const SNAP_MINUTES = 15;
const DEFAULT_MINUTES = 60;

const minutesBetween = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / 60_000);
/** How long the event lasts in minutes; an event without an end counts as an hour, as the calendar draws it. */
export const durationMinutes = (span: Span) => (span.endsAt ? Math.max(0, minutesBetween(new Date(span.startsAt), new Date(span.endsAt))) : DEFAULT_MINUTES);

/** Same time of day, on another date (`YYYY-MM-DD`, local). The end keeps the same length. */
export function moveToDate(span: Span, dateKey: string): { startsAt: string; endsAt: string | null } {
  const start = new Date(span.startsAt);
  const [year, month, day] = dateKey.split('-').map(Number);
  const next = new Date(start); next.setFullYear(year, month - 1, day);
  return { startsAt: next.toISOString(), endsAt: span.endsAt ? addMinutes(next, durationMinutes(span)).toISOString() : null };
}

/** Another day and hour (minutes kept). Used when an event is dropped on an hour in the day view. */
export function moveToHour(span: Span, dateKey: string, hour: number): { startsAt: string; endsAt: string | null } {
  const moved = new Date(moveToDate(span, dateKey).startsAt); moved.setHours(hour, new Date(span.startsAt).getMinutes(), 0, 0);
  return { startsAt: moved.toISOString(), endsAt: span.endsAt ? addMinutes(moved, durationMinutes(span)).toISOString() : null };
}

/** A new end after dragging the bottom edge by `deltaMinutes`: snapped to 15 minutes, never shorter than 15 minutes, never past midnight. */
export function resizeBy(span: Span, deltaMinutes: number): { startsAt: string; endsAt: string } {
  const start = new Date(span.startsAt);
  const wanted = Math.round((durationMinutes(span) + deltaMinutes) / SNAP_MINUTES) * SNAP_MINUTES;
  const endOfDay = new Date(start); endOfDay.setHours(24, 0, 0, 0);
  const length = Math.min(Math.max(SNAP_MINUTES, wanted), minutesBetween(start, endOfDay));
  return { startsAt: span.startsAt, endsAt: addMinutes(start, length).toISOString() };
}

/** Minutes for a vertical drag of `pixels`, where one hour is `hourHeight` pixels tall. */
export const pixelsToMinutes = (pixels: number, hourHeight: number) => (hourHeight > 0 ? Math.round(((pixels / hourHeight) * 60) / SNAP_MINUTES) * SNAP_MINUTES : 0);

function addMinutes(date: Date, minutes: number) {
  // Through wall-clock fields, not milliseconds, so a 9:00–10:00 event stays 9:00–10:00 on a daylight-saving day.
  const next = new Date(date); next.setMinutes(next.getMinutes() + minutes); return next;
}
