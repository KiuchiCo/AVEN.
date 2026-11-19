import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ganttLayout } from '../app/workspace/projects/gantt.ts';

const task = (id, startAt, dueAt, status = 'TODO') => ({ id, title: id, status, startAt, dueAt });
const now = new Date('2026-03-10T12:00:00Z');

test('undated tasks are left out and an empty chart has no rows', () => {
  assert.deepEqual(ganttLayout([task('a', null, null)], now).rows, []);
});
test('a bar spans start to due inclusive, with a marker for a single date', () => {
  const { rows, days } = ganttLayout([task('a', '2026-03-02', '2026-03-05'), task('b', null, '2026-03-20')], now);
  const a = rows.find((row) => row.id === 'a'); const b = rows.find((row) => row.id === 'b');
  assert.equal(a.isRange, true); assert.equal(b.isRange, false);
  assert.ok(Math.abs(a.widthPct - (4 / days) * 100) < 1e-9, 'four days wide');
  assert.ok(Math.abs(b.widthPct - (1 / days) * 100) < 1e-9, 'one day wide');
  assert.ok(b.leftPct > a.leftPct);
});
test('rows are ordered by start, bars stay inside the chart, today is marked when in range', () => {
  const layout = ganttLayout([task('late', '2026-03-12', '2026-03-14'), task('early', '2026-03-01', '2026-03-03')], now);
  assert.deepEqual(layout.rows.map((row) => row.id), ['early', 'late']);
  for (const row of layout.rows) assert.ok(row.leftPct >= 0 && row.leftPct + row.widthPct <= 100 + 1e-9);
  assert.ok(layout.todayPct > 0 && layout.todayPct < 100);
  assert.equal(ganttLayout([task('x', '2025-01-01', '2025-01-02')], now).todayPct, null);
});
test('a start after the due date is treated as the same span rather than a negative bar', () => {
  const [row] = ganttLayout([task('a', '2026-03-09', '2026-03-05')], now).rows;
  assert.ok(row.widthPct > 0);
});
