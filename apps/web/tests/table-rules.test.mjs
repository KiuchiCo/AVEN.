import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addColumn, addRow, cleanRows, newTable, removeColumn, removeRow, setCell, tableLimits } from '../app/workspace/documents/[documentId]/table-rules.ts';

test('a new table is a rectangle of empty cells', () => assert.deepEqual(newTable(2, 3), [['', '', ''], ['', '', '']]));
test('rows and columns are added and removed, never below one or above the limits', () => {
  let t = newTable(1, 1);
  assert.deepEqual(removeRow(t, 0), t); assert.deepEqual(removeColumn(t, 0), t);
  t = addColumn(addRow(t)); assert.deepEqual(t, [['', ''], ['', '']]);
  assert.deepEqual(removeColumn(setCell(t, 0, 1, 'x'), 0), [[ 'x'], ['']]);
  assert.deepEqual(removeRow(setCell(t, 1, 0, 'y'), 0), [['y', '']]);
  for (let i = 0; i < 50; i += 1) t = addColumn(addRow(t));
  assert.equal(t.length, tableLimits.rows); assert.equal(t[0].length, tableLimits.columns);
});
test('setting a cell changes only that cell, and long text is cut', () => {
  const t = newTable(2, 2); const next = setCell(t, 1, 0, 'z'.repeat(900));
  assert.equal(next[1][0].length, tableLimits.cell); assert.equal(next[0][0], ''); assert.equal(t[1][0], '', 'the original is untouched');
});
test('stored data is cleaned into a rectangle of strings, or replaced when unusable', () => {
  assert.deepEqual(cleanRows([['a'], ['b', 'c', 5]]), [['a', '', ''], ['b', 'c', '']]);
  assert.deepEqual(cleanRows('nope'), newTable()); assert.deepEqual(cleanRows([]), newTable());
  assert.equal(cleanRows(Array.from({ length: 99 }, () => ['x'])).length, tableLimits.rows);
});

import { applyCellOp, insertColumn, insertRow } from '../app/workspace/documents/[documentId]/table-rules.ts';
const grid = [['a1', 'b1', 'c1'], ['a2', 'b2', 'c2'], ['a3', 'b3', 'c3']];
test('rows and columns are inserted and removed where the cell is, not at the end', () => {
  assert.deepEqual(applyCellOp(grid, 'rowAbove', 1, 1), { rows: [grid[0], ['', '', ''], grid[1], grid[2]], row: 2, col: 1 });
  assert.deepEqual(applyCellOp(grid, 'rowBelow', 1, 1).rows, [grid[0], grid[1], ['', '', ''], grid[2]]);
  assert.deepEqual(applyCellOp(grid, 'rowBelow', 2, 0).rows.at(-1), ['', '', '']);
  assert.deepEqual(applyCellOp(grid, 'deleteRow', 1, 2), { rows: [grid[0], grid[2]], row: 1, col: 2 });
  assert.deepEqual(applyCellOp(grid, 'colBefore', 1, 1).rows, [['a1', '', 'b1', 'c1'], ['a2', '', 'b2', 'c2'], ['a3', '', 'b3', 'c3']]);
  assert.deepEqual(applyCellOp(grid, 'colAfter', 1, 1).rows[2], ['a3', 'b3', '', 'c3']);
  assert.deepEqual(applyCellOp(grid, 'deleteColumn', 0, 1), { rows: [['a1', 'c1'], ['a2', 'c2'], ['a3', 'c3']], row: 0, col: 1 });
  assert.deepEqual(applyCellOp(grid, 'deleteColumn', 0, 2).rows[0], ['a1', 'b1'], 'deleting the last column leaves the caret on the new last one');
});
test('operations never take a table below one row or column, or past the limits, and keep other content', () => {
  const one = [['x']];
  assert.deepEqual(applyCellOp(one, 'deleteRow', 0, 0).rows, one); assert.deepEqual(applyCellOp(one, 'deleteColumn', 0, 0).rows, one);
  let big = newTable(tableLimits.rows, tableLimits.columns);
  assert.equal(insertRow(big, 3), big); assert.equal(insertColumn(big, 3), big);
  assert.deepEqual(applyCellOp(grid, 'rowAbove', 99, 99).rows.length, 4, 'an out-of-range cell is clamped');
  assert.deepEqual(grid[0], ['a1', 'b1', 'c1'], 'the original is untouched');
});
test('tables of different sizes keep their content through a sequence of edits', () => {
  for (const [rows, cols] of [[1, 1], [2, 5], [6, 2], [4, 4]]) {
    let t = newTable(rows, cols).map((row, r) => row.map((_, c) => `r${r}c${c}`)); const original = t.map((row) => row.slice());
    t = applyCellOp(t, 'rowBelow', 0, 0).rows; t = applyCellOp(t, 'colAfter', 0, 0).rows;
    t = applyCellOp(t, 'deleteRow', 1, 0).rows; t = applyCellOp(t, 'deleteColumn', 0, 1).rows;
    assert.deepEqual(t, original);
  }
});
