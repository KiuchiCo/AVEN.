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

/** A blank row at `index` (0 = above the first row, rows.length = after the last). Unchanged at the row limit. */
export const insertRow = (rows: Rows, index: number): Rows => {
  if (rows.length >= tableLimits.rows) return rows;
  const at = Math.max(0, Math.min(rows.length, index));
  return [...rows.slice(0, at), Array.from({ length: rows[0]?.length ?? 1 }, () => ''), ...rows.slice(at)];
};
/** A blank column at `index` (0 = before the first column). Unchanged at the column limit. */
export const insertColumn = (rows: Rows, index: number): Rows => {
  if ((rows[0]?.length ?? 0) >= tableLimits.columns) return rows;
  const at = Math.max(0, Math.min(rows[0]?.length ?? 0, index));
  return rows.map((row) => [...row.slice(0, at), '', ...row.slice(at)]);
};

export type CellOp = 'rowAbove' | 'rowBelow' | 'deleteRow' | 'colBefore' | 'colAfter' | 'deleteColumn';
/** One row or column operation aimed at the cell (row, col), with the cell the caret belongs in afterwards. Everything outside that row or column is kept. */
export function applyCellOp(rows: Rows, op: CellOp, row: number, col: number): { rows: Rows; row: number; col: number } {
  const r = Math.max(0, Math.min(rows.length - 1, row)), c = Math.max(0, Math.min((rows[0]?.length ?? 1) - 1, col));
  switch (op) {
    case 'rowAbove': { const next = insertRow(rows, r); return { rows: next, row: next === rows ? r : r + 1, col: c }; }
    case 'rowBelow': { const next = insertRow(rows, r + 1); return { rows: next, row: next === rows ? r : r + 1, col: c }; }
    case 'deleteRow': { const next = removeRow(rows, r); return { rows: next, row: Math.min(r, next.length - 1), col: c }; }
    case 'colBefore': { const next = insertColumn(rows, c); return { rows: next, row: r, col: next === rows ? c : c + 1 }; }
    case 'colAfter': { const next = insertColumn(rows, c + 1); return { rows: next, row: r, col: c }; }
    case 'deleteColumn': { const next = removeColumn(rows, c); return { rows: next, row: r, col: Math.min(c, (next[0]?.length ?? 1) - 1) }; }
  }
}
