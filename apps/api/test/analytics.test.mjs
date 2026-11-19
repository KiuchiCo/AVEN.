import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAnalytics } from '../dist/analytics/analytics-rules.js';

const now = new Date('2026-03-10T15:00:00Z');
const d = (s) => new Date(`${s}T12:00:00Z`);
let n = 0;
const task = (o) => ({ id: `t${++n}`, status: 'TODO', priority: 'MEDIUM', assigneeId: null, createdAt: d('2026-03-01'), completedAt: null, dueAt: null, ...o });
const run = (tasks, days = 7, usage = []) => buildAnalytics({ tasks, usage, now, days, names: new Map([['a', 'Ana'], ['b', 'Ben']]) });

test('the window has one entry per day ending today, and counts what was created and completed each day', () => {
  const a = run([task({ createdAt: d('2026-03-08') }), task({ createdAt: d('2026-03-08'), status: 'COMPLETED', completedAt: d('2026-03-09') }), task({ createdAt: d('2026-02-01') })]);
  assert.equal(a.daily.length, 7); assert.equal(a.range.from, '2026-03-04'); assert.equal(a.range.to, '2026-03-10');
  assert.deepEqual(a.daily.find((x) => x.date === '2026-03-08'), { date: '2026-03-08', created: 2, completed: 0 });
  assert.equal(a.daily.find((x) => x.date === '2026-03-09').completed, 1);
  assert.equal(a.totals.created, 2, 'tasks created before the window are not counted'); assert.equal(a.totals.completed, 1);
});
test('open, overdue and due-soon count only unfinished work; finished and cancelled never count', () => {
  const a = run([task({ dueAt: d('2026-03-05') }), task({ dueAt: d('2026-03-10') }), task({ dueAt: d('2026-03-17') }), task({ dueAt: d('2026-03-18') }), task({ status: 'COMPLETED', completedAt: d('2026-03-02'), dueAt: d('2026-03-01') }), task({ status: 'CANCELLED', dueAt: d('2026-03-01') })]);
  assert.deepEqual([a.totals.open, a.totals.overdue, a.totals.dueSoon], [4, 1, 2]);
});
test('cycle time is the average and median days from creation to completion inside the window', () => {
  const a = run([task({ createdAt: d('2026-03-05'), status: 'COMPLETED', completedAt: d('2026-03-06') }), task({ createdAt: d('2026-03-04'), status: 'COMPLETED', completedAt: d('2026-03-10') }), task({ createdAt: d('2026-03-01'), status: 'COMPLETED', completedAt: d('2026-03-04') })]);
  assert.deepEqual(a.cycleDays, { count: 3, average: 3.3, median: 3 });
  assert.deepEqual(run([]).cycleDays, { count: 0, average: null, median: null });
});
test('workload groups open tasks by person, with names, overdue counts and an Unassigned row, biggest first', () => {
  const a = run([task({ assigneeId: 'a' }), task({ assigneeId: 'b', dueAt: d('2026-03-01') }), task({ assigneeId: 'b' }), task({}), task({ assigneeId: 'gone' }), task({ assigneeId: 'a', status: 'COMPLETED', completedAt: d('2026-03-09') })]);
  assert.deepEqual(a.workload.map((w) => [w.name, w.open, w.overdue]), [['Ben', 2, 1], ['Ana', 1, 0], ['Former member', 1, 0], ['Unassigned', 1, 0]]);
  assert.equal(a.workload[3].assigneeId, null);
});
test('status and priority breakdowns cover open work, and AI credits are filled in per day', () => {
  const a = run([task({ status: 'IN_PROGRESS', priority: 'HIGH' }), task({ priority: 'HIGH' }), task({ status: 'COMPLETED', completedAt: d('2026-03-09') })], 3, [{ day: '2026-03-09', credits: 12 }, { day: '2025-01-01', credits: 99 }]);
  assert.deepEqual(a.openByStatus, { IN_PROGRESS: 1, TODO: 1 }); assert.deepEqual(a.openByPriority, { HIGH: 2 });
  assert.deepEqual(a.aiCredits, [{ date: '2026-03-08', credits: 0 }, { date: '2026-03-09', credits: 12 }, { date: '2026-03-10', credits: 0 }]);
});
