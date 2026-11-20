import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellValue, filterRecords, groupRecords, sortRecords } from '../app/workspace/documents/[documentId]/table-logic.ts';

const props = [{ id: 'name', name: 'Name', type: 'text' }, { id: 'n', name: 'Budget', type: 'number' }, { id: 's', name: 'Status', type: 'status' }];
const rec = (id, name, n, s) => ({ id, values: { name, n, s } });
const rows = [rec('a', 'Alpha', 10, 'Done'), rec('b', 'beta', 9, 'Open'), rec('c', 'Gamma', undefined, 'Done'), rec('d', 'Delta', 100, undefined)];

test('filtering needs every word to appear somewhere in the row, ignoring case', () => {
  assert.deepEqual(filterRecords(rows, props, 'done alp').map((r) => r.id), ['a']);
  assert.deepEqual(filterRecords(rows, props, '').map((r) => r.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(filterRecords(rows, props, 'zzz'), []);
});
test('sorting reads numbers as numbers and puts empty cells last in both directions', () => {
  assert.deepEqual(sortRecords(rows, props, { property: 'n', direction: 'asc' }).map((r) => r.id), ['b', 'a', 'd', 'c']);
  assert.deepEqual(sortRecords(rows, props, { property: 'n', direction: 'desc' }).map((r) => r.id), ['d', 'a', 'b', 'c']);
  assert.deepEqual(sortRecords(rows, props, { property: 'name', direction: 'asc' }).map((r) => r.id), ['a', 'b', 'd', 'c']);
  assert.equal(sortRecords(rows, props, null), rows);
});
test('grouping keeps first-seen order and puts records without a value last', () => {
  const groups = groupRecords(rows, 's');
  assert.deepEqual(groups.map((g) => `${g.label}:${g.records.length}`), ['Done:2', 'Open:1', ':1']);
  assert.equal(groupRecords(rows, null)[0].records, rows);
});
test('an edit becomes the value the database expects for that kind of property', () => {
  assert.equal(cellValue('number', '12.5'), 12.5); assert.equal(cellValue('number', ''), null); assert.equal(cellValue('number', 'abc'), null);
  assert.equal(cellValue('checkbox', true), true); assert.equal(cellValue('text', 'hi'), 'hi');
});
