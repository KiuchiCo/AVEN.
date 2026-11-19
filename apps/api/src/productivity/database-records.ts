import { BadRequestException } from '@nestjs/common';

export const rollupFunctions = ['count', 'sum', 'average', 'min', 'max'] as const;
export type RollupFunction = (typeof rollupFunctions)[number];

export const MAX_BULK_RECORDS = 200;

/**
 * Summarises linked records. `count` is the number of linked records; the others use only numeric values of
 * `propertyId`. With nothing numeric, sum is 0 and average/min/max are null (shown as an empty cell).
 */
export function computeRollup(fn: RollupFunction, linked: Array<Record<string, unknown>>, propertyId?: string): number | null {
  if (fn === 'count') return linked.length;
  const numbers = linked.map((values) => (propertyId ? values[propertyId] : undefined)).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (fn === 'sum') return numbers.reduce((total, value) => total + value, 0);
  if (!numbers.length) return null;
  if (fn === 'average') return numbers.reduce((total, value) => total + value, 0) / numbers.length;
  return fn === 'min' ? Math.min(...numbers) : Math.max(...numbers);
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates the id list for a bulk action: 1–200 unique UUIDs. */
export function parseBulkIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BULK_RECORDS || value.some((id) => typeof id !== 'string' || !uuid.test(id))) {
    throw new BadRequestException(`Select between 1 and ${MAX_BULK_RECORDS} records.`);
  }
  return [...new Set(value as string[])];
}
