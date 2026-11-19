export type RemoteEvent = { id: string; etag: string; title: string; description: string | null; location: string | null; isAllDay: boolean; startsAt: Date; endsAt: Date | null; updatedAt: Date; cancelled: boolean };
export type EventContent = { title: string; description: string | null; location: string | null; isAllDay: boolean; startsAt: Date; endsAt: Date | null };

const DAY = 86_400_000;
const NOON = 12 * 3_600_000;
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

/**
 * AVEN stores an all-day event as the first day at 12:00 UTC, and (for several days) the last day at 12:00 UTC.
 * Providers use a start date and an exclusive end date. These convert between the two.
 */
export function fromAllDayDates(start: string, endExclusive: string | undefined): { startsAt: Date; endsAt: Date | null } {
  const startsAt = new Date(new Date(`${start}T00:00:00Z`).getTime() + NOON);
  if (!endExclusive) return { startsAt, endsAt: null };
  const last = new Date(new Date(`${endExclusive}T00:00:00Z`).getTime() + NOON - DAY);
  return { startsAt, endsAt: last.getTime() > startsAt.getTime() ? last : null };
}
export function toAllDayDates(startsAt: Date, endsAt: Date | null): { start: string; endExclusive: string } {
  const last = endsAt && endsAt.getTime() > startsAt.getTime() ? endsAt : startsAt;
  return { start: dateOnly(startsAt), endExclusive: dateOnly(new Date(last.getTime() + DAY)) };
}

/** Fits a provider's event into what AVEN can hold, so one odd event can't break a whole sync. */
export function toContent(remote: RemoteEvent): EventContent {
  const title = remote.title.trim().slice(0, 200) || 'Untitled event';
  return { title, description: remote.description?.trim().slice(0, 2000) || null, location: remote.location?.trim().slice(0, 250) || null, isAllDay: remote.isAllDay, startsAt: remote.startsAt, endsAt: remote.endsAt && remote.endsAt > remote.startsAt ? remote.endsAt : null };
}

export const sameContent = (a: EventContent, b: EventContent) => a.title === b.title && (a.description ?? null) === (b.description ?? null) && (a.location ?? null) === (b.location ?? null) && a.isAllDay === b.isAllDay && a.startsAt.getTime() === b.startsAt.getTime() && (a.endsAt?.getTime() ?? null) === (b.endsAt?.getTime() ?? null);
