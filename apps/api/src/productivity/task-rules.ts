import { BadRequestException } from '@nestjs/common';

export type TaskRecurrence = 'DAILY' | 'WEEKLY' | 'MONTHLY';
const recurrences: readonly string[] = ['DAILY', 'WEEKLY', 'MONTHLY'];

/**
 * The next due date after a repeating task is completed: the first occurrence strictly after both the
 * previous due date and `after` (normally now), so finishing a task late never leaves a backlog of overdue copies.
 * Calendar arithmetic is in UTC. A month-end date is clamped (31 Jan → 28 Feb).
 * shortcut: each new task starts a fresh series from its own due date, so a 31st can settle on the 28th; store an anchor day if that matters.
 */
export function nextDueDate(dueAt: Date, recurrence: TaskRecurrence, interval: number, after: Date): Date {
  const occurrence = (steps: number) => {
    const date = new Date(dueAt);
    if (recurrence === 'DAILY') date.setUTCDate(date.getUTCDate() + steps * interval);
    else if (recurrence === 'WEEKLY') date.setUTCDate(date.getUTCDate() + 7 * steps * interval);
    else {
      const day = dueAt.getUTCDate();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + steps * interval);
      const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(day, lastDay));
    }
    return date;
  };
  let steps = 1;
  let next = occurrence(steps);
  while (next <= after && steps < 20_000) next = occurrence(++steps);
  return next;
}

export type RecurrenceFields = { recurrence?: TaskRecurrence | null; recurrenceInterval?: number; recurrenceUntil?: Date | null };

/** Reads only the repeat fields present in a request body. Absent fields are left out so updates stay partial. */
export function parseRecurrence(body: Record<string, unknown>): RecurrenceFields {
  const fields: RecurrenceFields = {};
  if ('recurrence' in body) {
    if (body.recurrence === null || body.recurrence === '') fields.recurrence = null;
    else if (typeof body.recurrence === 'string' && recurrences.includes(body.recurrence)) fields.recurrence = body.recurrence as TaskRecurrence;
    else throw new BadRequestException('Repeat must be daily, weekly, monthly, or off.');
    if (fields.recurrence === null) { fields.recurrenceInterval = 1; fields.recurrenceUntil = null; }
  }
  if ('recurrenceInterval' in body) {
    const value = body.recurrenceInterval;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 365) throw new BadRequestException('Repeat interval must be a whole number from 1 to 365.');
    fields.recurrenceInterval = value;
  }
  if ('recurrenceUntil' in body && body.recurrence !== null && body.recurrence !== '') {
    if (body.recurrenceUntil === null || body.recurrenceUntil === '') fields.recurrenceUntil = null;
    else {
      const date = typeof body.recurrenceUntil === 'string' ? new Date(body.recurrenceUntil) : null;
      if (!date || Number.isNaN(date.getTime())) throw new BadRequestException('Repeat end date is invalid.');
      fields.recurrenceUntil = date;
    }
  }
  return fields;
}
