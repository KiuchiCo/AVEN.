import assert from 'node:assert/strict';
import test from 'node:test';
import { csvCell, parseTaskCsv } from '../app/workspace/projects/task-csv.ts';

const headers = ['id', 'title', 'description', 'status', 'priority', 'dueAt', 'projectId', 'assigneeId', 'labels'];

function exportRow(values = {}) {
  const row = {
    id: '', title: 'Plan launch', description: '', status: 'TODO', priority: 'MEDIUM',
    dueAt: '', projectId: '', assigneeId: '', labels: '', ...values,
  };
  return headers.map((header) => csvCell(String(row[header]))).join(',');
}

test('round trips AVEN rows with quoted commas, line breaks, labels, and identifiers', () => {
  const text = `\uFEFF${headers.join(',')}\r\n${exportRow({
    id: '7f1c3d87-e7e6-4ec0-9f53-7f8403771a42',
    title: 'Plan, then launch', description: 'First line\nSecond "quoted" line',
    status: 'IN_PROGRESS', priority: 'HIGH', dueAt: '2026-12-01T00:00:00.000Z',
    projectId: '7f1c3d87-e7e6-4ec0-9f53-7f8403771a43',
    assigneeId: '7f1c3d87-e7e6-4ec0-9f53-7f8403771a44', labels: 'launch;research',
  })}`;
  assert.deepEqual(parseTaskCsv(text), [{
    id: '7f1c3d87-e7e6-4ec0-9f53-7f8403771a42',
    title: 'Plan, then launch', description: 'First line\nSecond "quoted" line',
    status: 'IN_PROGRESS', priority: 'HIGH', dueAt: '2026-12-01T00:00:00.000Z',
    projectId: '7f1c3d87-e7e6-4ec0-9f53-7f8403771a43',
    assigneeId: '7f1c3d87-e7e6-4ec0-9f53-7f8403771a44', labels: ['launch', 'research'],
  }]);
});

test('applies safe defaults and restores formula-protected cell values', () => {
  const csv = `title,description,labels\r\n${csvCell('=SUM(A1:A2)')},,${csvCell('Project_Plan;Q4')}`;
  assert.deepEqual(parseTaskCsv(csv), [{
    id: null, title: '=SUM(A1:A2)', description: null, status: 'TODO', priority: 'MEDIUM',
    dueAt: null, labels: ['project_plan', 'q4'],
  }]);
});

test('rejects incomplete round-trip exports, malformed quoting, and duplicate headers', () => {
  assert.throws(() => parseTaskCsv('id,title\n,Task'), /requires all export columns/);
  assert.throws(() => parseTaskCsv('title,description\n"unclosed,note'), /unclosed quoted field/);
  assert.throws(() => parseTaskCsv('title,title\nA,B'), /duplicate column names/);
});

test('rejects invalid ids, statuses, dates, and labels', () => {
  assert.throws(() => parseTaskCsv(`${headers.join(',')}\n${headers.map((header) => csvCell(header === 'id' ? 'not-a-uuid' : header === 'title' ? 'Task' : '')).join(',')}`), /valid UUID/);
  assert.throws(() => parseTaskCsv('title,status\nTask,WAITING'), /Status on row/);
  assert.throws(() => parseTaskCsv('title,dueAt\nTask,not-a-date'), /not a valid date/);
  assert.throws(() => parseTaskCsv('title,labels\nTask,has spaces'), /Labels on row/);
});

test('limits imports to 200 task rows', () => {
  const rows = ['title', ...Array.from({ length: 201 }, (_, index) => `Task ${index + 1}`)];
  assert.throws(() => parseTaskCsv(rows.join('\n')), /Import no more than 200 tasks/);
});

test('an optional startAt column is read, validated, and not required for round trips', () => {
  const withStart = ['id', 'title', 'description', 'status', 'priority', 'startAt', 'dueAt', 'projectId', 'assigneeId', 'labels'];
  const line = (values) => withStart.map((header) => csvCell(String(({ id: '', title: 'A', description: '', status: 'TODO', priority: 'LOW', startAt: '', dueAt: '', projectId: '', assigneeId: '', labels: '', ...values })[header]))).join(',');
  const parse = (text) => parseTaskCsv(text);
  assert.equal(parse(`${withStart.join(',')}\n${line({ startAt: '2026-03-01', dueAt: '2026-03-05' })}`)[0].startAt, '2026-03-01');
  assert.throws(() => parse(`${withStart.join(',')}\n${line({ startAt: 'soon' })}`), /Start date/);
  assert.throws(() => parse(`${withStart.join(',')}\n${line({ startAt: '2026-03-09', dueAt: '2026-03-05' })}`), /after its due date/);
  const old = parse(`${headers.join(',')}\n${exportRow()}`)[0];
  assert.equal('startAt' in old, false, 'a file without the column leaves start dates alone');
});

test('security: a cell that starts like a formula is defused, so a shared name cannot run in a spreadsheet', () => {
  for (const name of ['=HYPERLINK("http://x","y")', '+SUM(1)', '-2+3', '@cmd', '\tTAB']) assert.ok(csvCell(name).startsWith('"\''), name);
  assert.equal(csvCell('Plain'), '"Plain"');
});
