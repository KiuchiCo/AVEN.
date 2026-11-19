import { BadRequestException, ConflictException } from '@nestjs/common';

/** The `updatedAt` the editor last saw. Postgres stores milliseconds, so an exact match means nobody else saved in between. */
export function parseBaseUpdatedAt(value: unknown): Date {
  const date = typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new BadRequestException('baseUpdatedAt is required so edits made by someone else are never overwritten.');
  }
  return date;
}

/** Thrown when the document changed since the editor loaded it. Carries the current copy so the client can offer a choice. */
export function documentConflict<T>(current: T) {
  return new ConflictException({ message: 'This document was changed by someone else while you were editing.', current });
}

/** Same protection for database records: the record changed since the editor loaded it. */
export function recordConflict<T>(current: T) {
  return new ConflictException({ message: 'This record was changed by someone else while you were editing.', current });
}

/** Same protection for calendar events. */
export function eventConflict<T>(current: T) {
  return new ConflictException({ message: 'This event was changed by someone else while you were editing.', current });
}
