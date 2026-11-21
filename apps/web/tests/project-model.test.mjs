import assert from 'node:assert/strict';
import test from 'node:test';
import { activeFilterCount, defaultFilters, directoryCounts, directoryRows, filterTasks, milestoneTimeline, monthGrid, percent, taskStats, workload } from '../app/workspace/projects/project-model.ts';

const now = new Date(2026, 5, 15, 10, 0);
const person = (id, displayName = id) => ({ id, displayName });
const task = (id, extra = {}) => ({ id, title: id, description: null, status: 'TODO', priority: 'MEDIUM', labels: [], startAt: null, dueAt: null, project: { id: 'p', name: 'P' }, assignee: null, dependsOn: [], blocks: [], ...extra });
const project = (id, extra = {}) => ({ id, name: id, description: null, status: 'PLANNING', startAt: null, dueAt: null, visibility: 'WORKSPACE', budgetTotalCents: null, budgetSpentCents: 0, ownerId: 'u', owner: person('u', 'Una'), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', taskCount: 0, completedCount: 0, ...extra });

test('progress ignores cancelled tasks and never exceeds 100', () => {
  assert.equal(percent(1, 3), 33); assert.equal(percent(0, 0), 0); assert.equal(percent(5, 3), 100);
  const stats = taskStats([task('a', { status: 'COMPLETED' }), task('b', { status: 'CANCELLED' }), task('c', { status: 'IN_PROGRESS', dueAt: '2026-06-01T00:00:00Z' }), task('d')], now);
  assert.deepEqual([stats.total, stats.planned, stats.completed, stats.inProgress, stats.overdue, stats.unassigned, stats.progress], [4, 3, 1, 1, 1, 2, 33]);
});

test('task filters combine and keep the saved-view sort orders', () => {
  const tasks = [task('a', { dueAt: '2026-06-20T00:00:00Z', priority: 'HIGH', labels: ['ui'], assignee: person('x') }), task('b', { dueAt: '2026-06-10T00:00:00Z' }), task('c', { dependsOn: [{ id: 'a', title: 'a', status: 'TODO' }] }), task('d', { status: 'COMPLETED', dueAt: '2026-06-01T00:00:00Z' })];
  const f = (patch) => filterTasks(tasks, { ...defaultFilters(), ...patch }, now).map((x) => x.id).join('');
  assert.equal(f({}), 'dbac'); assert.equal(f({ due: 'OVERDUE' }), 'b', 'completed work is never overdue');
  assert.equal(f({ due: 'NEXT_7_DAYS' }), 'a'); assert.equal(f({ due: 'NO_DATE' }), 'c'); assert.equal(f({ label: 'ui' }), 'a');
  assert.equal(f({ assigneeId: 'UNASSIGNED' }), 'dbc'); assert.equal(f({ dependency: 'BLOCKED' }), 'c'); assert.equal(f({ search: 'UI' }), 'a');
  assert.equal(f({ sort: 'PRIORITY' }).startsWith('a'), true); assert.equal(f({ sort: 'TITLE' }), 'abcd');
  assert.equal(activeFilterCount({ ...defaultFilters(), search: 'x', sort: 'TITLE', status: 'TODO' }), 2);
});

test('workload counts per person, keeps people with no tasks, and ends with the unassigned row', () => {
  const rows = workload([task('a', { assignee: person('x', 'Xi'), dueAt: '2026-06-01T00:00:00Z' }), task('b', { assignee: person('x', 'Xi'), status: 'COMPLETED' }), task('c'), task('d', { status: 'CANCELLED', assignee: person('y', 'Yo') })], [{ userId: 'x', displayName: 'Xi' }, { userId: 'z', displayName: 'Zed' }], 'Unassigned', now);
  assert.deepEqual(rows.map((r) => [r.name, r.assigned, r.completed, r.outstanding, r.overdue]), [['Xi', 2, 1, 1, 1], ['Zed', 0, 0, 0, 0], ['Unassigned', 1, 0, 1, 0]]);
});

test('the directory hides archived projects until asked, and searches name, summary and owner', () => {
  const list = [project('Alpha', { status: 'IN_PROGRESS', dueAt: '2026-09-01' }), project('Beta', { status: 'ARCHIVED' }), project('Gamma', { description: 'Website', status: 'COMPLETED', dueAt: '2026-07-01' })];
  assert.deepEqual(directoryRows(list, '', 'ALL', 'NAME').map((p) => p.name), ['Alpha', 'Gamma']);
  assert.deepEqual(directoryRows(list, '', 'ARCHIVED', 'NAME').map((p) => p.name), ['Beta']);
  assert.deepEqual(directoryRows(list, 'web', 'ALL', 'NAME').map((p) => p.name), ['Gamma']); assert.deepEqual(directoryRows(list, 'una', 'ALL', 'DUE').map((p) => p.name), ['Gamma', 'Alpha']);
  assert.deepEqual(directoryCounts(list), { total: 2, inProgress: 1, completed: 1, onHold: 0, archived: 1 });
});

test('the month grid starts on Monday and covers the whole month', () => {
  const weeks = monthGrid(2026, 5);
  assert.equal(weeks[0][0].key, '2026-06-01'); assert.equal(weeks.flat().filter((c) => c.inMonth).length, 30); assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(monthGrid(2026, 1)[0][0].key, '2026-01-26');
});

test('the milestone timeline is chronological with undated milestones last', () => {
  const m = (id, dueAt, completedAt = null) => ({ id, title: id, description: null, dueAt, completedAt, tasks: [], taskCount: 0, completedCount: 0 });
  const rows = milestoneTimeline([m('later', '2026-08-01'), m('none', null), m('past', '2026-05-01'), m('done', '2026-05-02', '2026-05-02')], now);
  assert.deepEqual(rows.map((r) => `${r.milestone.id}:${r.state}`), ['past:OVERDUE', 'done:DONE', 'later:UPCOMING', 'none:UPCOMING']);
});
