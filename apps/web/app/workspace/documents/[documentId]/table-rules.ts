export const tableLimits = { rows: 30, columns: 8, cell: 500 } as const;
export type Rows = string[][];

export const newTable = (rows = 3, columns = 3): Rows => Array.from({ length: rows }, () => Array.from({ length: columns }, () => ''));

/** Every row the same width, within limits, strings only. Anything unusable becomes a fresh 3×3 table. */
export function cleanRows(value: unknown): Rows {
  if (!Array.isArray(value) || !value.length) return newTable();
  const width = Math.min(tableLimits.columns, Math.max(1, ...value.map((row) => (Array.isArray(row) ? row.length : 0))));
  return value.slice(0, tableLimits.rows).map((row) => Array.from({ length: width }, (_, i) => (Array.isArray(row) && typeof row[i] === 'string' ? (row[i] as string).slice(0, tableLimits.cell) : '')));
}

export const addRow = (rows: Rows): Rows => (rows.length >= tableLimits.rows ? rows : [...rows, Array.from({ length: rows[0]?.length ?? 1 }, () => '')]);
export const addColumn = (rows: Rows): Rows => ((rows[0]?.length ?? 0) >= tableLimits.columns ? rows : rows.map((row) => [...row, '']));
export const removeRow = (rows: Rows, index: number): Rows => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== index));
export const removeColumn = (rows: Rows, index: number): Rows => ((rows[0]?.length ?? 0) <= 1 ? rows : rows.map((row) => row.filter((_, i) => i !== index)));
export const setCell = (rows: Rows, r: number, c: number, text: string): Rows => rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? text.slice(0, tableLimits.cell) : cell)) : row));
