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
