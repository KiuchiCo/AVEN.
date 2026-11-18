export function validateOffset(value: unknown): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || (value as number) < -3650 || (value as number) > 3650) throw new Error('Relative dates must be whole days between −3,650 and 3,650.');
  return value as number;
}
