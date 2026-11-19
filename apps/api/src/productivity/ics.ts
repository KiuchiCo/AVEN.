import { createHash } from 'node:crypto';

export type ParsedEvent = {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date | null;
  isAllDay: boolean;
  recurrence: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;
  recurrenceInterval: number;
  recurrenceUntil: Date | null;
  recurrenceTimeZone: string | null;
};
export type SkippedEvent = { title: string; reason: string };
export type IcsResult = { events: ParsedEvent[]; skipped: SkippedEvent[]; notes: string[] };

type Property = { name: string; params: Record<string, string>; value: string };

/** Joins folded lines (RFC 5545: a line starting with a space or tab continues the previous one). */
function unfold(text: string) {
  const lines: string[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length) lines[lines.length - 1] += raw.slice(1);
    else lines.push(raw);
  }
  return lines;
}

function parseProperty(line: string): Property | null {
  let quoted = false;
  let colon = -1;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    else if (line[index] === ':' && !quoted) { colon = index; break; }
  }
  if (colon < 1) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(';');
  const params: Record<string, string> = {};
  for (const param of rawParams) {
    const equals = param.indexOf('=');
    if (equals > 0) params[param.slice(0, equals).toUpperCase()] = param.slice(equals + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

const unescapeText = (value: string) => value.replace(/\\([nN,;\\])/g, (_, character: string) => (character === 'n' || character === 'N' ? '\n' : character));

function wallTimeInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

/** Converts a local wall-clock time in an IANA zone to the UTC instant. Returns null for an unknown zone. */
export function zonedToUtc(wall: number, timeZone: string): Date | null {
  try {
    let guess = wall;
    for (let pass = 0; pass < 3; pass += 1) guess += wall - wallTimeInZone(new Date(guess), timeZone);
    return new Date(guess);
  } catch { return null; }
}

type ParsedDate = { date: Date; allDay: boolean; floating: boolean } | { error: string };

function parseDate(property: Property): ParsedDate {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(property.value.trim());
  if (!match) return { error: `unreadable date “${property.value}”` };
  const [, year, month, day, hour, minute, second, utc] = match;
  const numbers = [year, month, day, hour ?? '0', minute ?? '0', second ?? '0'].map(Number);
  const wall = Date.UTC(numbers[0], numbers[1] - 1, numbers[2], numbers[3], numbers[4], numbers[5]);
  if (hour === undefined) return { date: new Date(Date.UTC(numbers[0], numbers[1] - 1, numbers[2], 12)), allDay: true, floating: false };
  if (utc) return { date: new Date(wall), allDay: false, floating: false };
  const timeZone = property.params.TZID;
  if (!timeZone) return { date: new Date(wall), allDay: false, floating: true };
  const converted = zonedToUtc(wall, timeZone);
  return converted ? { date: converted, allDay: false, floating: false } : { error: `unrecognised time zone “${timeZone}”` };
}

const DAY = 86_400_000;
const trim = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);

/**
 * Reads VEVENTs from an iCalendar file. Anything AVEN cannot represent faithfully is reported in `skipped`
 * rather than imported wrongly: complex repeat rules, excluded dates, edited single occurrences, unknown zones.
 * Floating times (no zone) are treated as UTC. Repeats with no end date are limited to two years.
 */
export function parseIcs(text: string): IcsResult {
  const result: IcsResult = { events: [], skipped: [], notes: [] };
  const byUid = new Map<string, ParsedEvent>();
  let current: Property[] | null = null;
  let alarmDepth = 0;
  let floating = false;
  let cappedRepeat = false;

  const finish = (props: Property[]) => {
    const find = (name: string) => props.find((property) => property.name === name);
    const title = unescapeText(find('SUMMARY')?.value ?? '').trim() || '(No title)';
    const skip = (reason: string) => result.skipped.push({ title, reason });
    if (find('RECURRENCE-ID')) return skip('a changed single occurrence of a repeating event');
    if (find('STATUS')?.value.toUpperCase() === 'CANCELLED') return skip('cancelled');
    if (find('EXDATE')) return skip('a repeating event with excluded dates');
    const startProperty = find('DTSTART');
    if (!startProperty) return skip('no start time');
    const start = parseDate(startProperty);
    if ('error' in start) return skip(start.error);
    if (start.floating) floating = true;

    let endsAt: Date | null = null;
    const endProperty = find('DTEND');
    if (endProperty) {
      const end = parseDate(endProperty);
      if ('error' in end) return skip(end.error);
      if (start.allDay) {
        const lastDay = new Date(end.date.getTime() - DAY);
        endsAt = lastDay.getTime() > start.date.getTime() ? lastDay : null;
      } else endsAt = end.date.getTime() > start.date.getTime() ? end.date : null;
    }

    let recurrence: ParsedEvent['recurrence'] = null;
    let recurrenceInterval = 1;
    let recurrenceUntil: Date | null = null;
    let recurrenceTimeZone: string | null = null;
    const rule = find('RRULE');
    if (rule) {
      const parts = Object.fromEntries(rule.value.split(';').map((part) => { const [key, ...value] = part.split('='); return [key.toUpperCase(), value.join('=')]; }));
      const unsupported = Object.keys(parts).find((key) => !['FREQ', 'INTERVAL', 'UNTIL', 'WKST'].includes(key));
      if (unsupported) return skip(`a repeat rule AVEN can’t represent (${unsupported})`);
      if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(parts.FREQ)) return skip(`repeats ${String(parts.FREQ ?? 'in an unknown way').toLowerCase()}`);
      const interval = parts.INTERVAL === undefined ? 1 : Number(parts.INTERVAL);
      if (!Number.isInteger(interval) || interval < 1 || interval > 12) return skip('a repeat interval outside 1–12');
      const maxUntil = new Date(start.date); maxUntil.setFullYear(maxUntil.getFullYear() + 2);
      let until = maxUntil;
      if (parts.UNTIL) {
        const parsed = parseDate({ name: 'UNTIL', params: startProperty.params, value: parts.UNTIL });
        if ('error' in parsed) return skip(parsed.error);
        const end = parsed.allDay ? new Date(parsed.date.getTime() + 12 * 3_600_000 - 1) : parsed.date;
        if (end > maxUntil) cappedRepeat = true; else until = end;
      } else cappedRepeat = true;
      if (until > start.date) {
        recurrence = parts.FREQ as ParsedEvent['recurrence']; recurrenceInterval = interval; recurrenceUntil = until;
        recurrenceTimeZone = startProperty.params.TZID && zonedToUtc(0, startProperty.params.TZID) ? startProperty.params.TZID : 'UTC';
      }
    }

    const title200 = trim(title, 200);
    const uid = trim(find('UID')?.value.trim() || `noid-${createHash('sha256').update(`${title}|${start.date.toISOString()}`).digest('hex').slice(0, 32)}`, 255);
    const description = unescapeText(find('DESCRIPTION')?.value ?? '').trim();
    const location = unescapeText(find('LOCATION')?.value ?? '').trim();
    byUid.set(uid, {
      uid, title: title200, description: description ? trim(description, 2000) : null, location: location ? trim(location, 250) : null,
      startsAt: start.date, endsAt, isAllDay: start.allDay, recurrence, recurrenceInterval, recurrenceUntil, recurrenceTimeZone,
    });
  };

  for (const line of unfold(text)) {
    const upper = line.trim().toUpperCase();
    if (upper === 'BEGIN:VEVENT') { current = []; alarmDepth = 0; continue; }
    if (upper === 'END:VEVENT') { if (current) finish(current); current = null; continue; }
    if (!current) continue;
    if (upper === 'BEGIN:VALARM') { alarmDepth += 1; continue; }
    if (upper === 'END:VALARM') { alarmDepth = Math.max(0, alarmDepth - 1); continue; }
    if (alarmDepth) continue;
    const property = parseProperty(line);
    if (property) current.push(property);
  }

  result.events = [...byUid.values()];
  if (floating) result.notes.push('Some events had no time zone, so their times were read as UTC.');
  if (cappedRepeat) result.notes.push('Repeating events with no end date (or one beyond two years) were limited to two years.');
  return result;
}
