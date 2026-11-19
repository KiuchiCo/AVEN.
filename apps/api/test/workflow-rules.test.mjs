import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { checkWebhookUrl, evaluateCondition, isPublicAddress, nextPath, nextScheduledRun, parseWorkflow, render, retryDelay, stepAt, MAX_ATTEMPTS } from '../dist/workflows/workflow-rules.js';

const base = { name: 'Flow', trigger: { type: 'task_status_changed', toStatus: 'COMPLETED' }, steps: [{ id: 's1', type: 'notify', message: 'Done: {{task.title}}', recipients: 'creator' }] };
const wf = (patch) => ({ ...base, ...patch });
const rejects = (input, pattern) => assert.throws(() => parseWorkflow(input), (e) => e instanceof BadRequestException && (!pattern || pattern.test(e.message)), JSON.stringify(input).slice(0, 120));

test('a valid workflow is rebuilt from validated pieces only', () => {
  const parsed = parseWorkflow(wf({ description: ' d ', enabled: true, steps: [
    { id: 's1', type: 'branch', condition: { field: 'task.priority', operator: 'equals', value: 'HIGH', junk: 1 }, then: [{ id: 's2', type: 'create_task', title: 'Follow up', priority: 'HIGH', dueInDays: 3, project: 'same', assignee: 'trigger', evil: true }], else: [{ id: 's3', type: 'delay', minutes: 60 }] },
    { id: 's4', type: 'update_task', status: 'IN_REVIEW', addLabels: ['Ops', 'ops', 'review'] },
    { id: 's5', type: 'webhook', url: 'https://example.com/hook', message: 'hi' },
    { id: 's6', type: 'ai', prompt: 'Summarise {{task.title}}' },
  ] }));
  assert.equal(parsed.description, 'd');
  assert.equal(parsed.enabled, true);
  assert.deepEqual(parsed.steps[0].condition, { field: 'task.priority', operator: 'equals', value: 'HIGH' });
  assert.equal('evil' in parsed.steps[0].then[0], false);
  assert.deepEqual(parsed.steps[1].addLabels, ['ops', 'review']);
});

test('top-level problems are rejected with a clear message', () => {
  for (const [input, pattern] of [[null, /JSON object/], [wf({ name: '' }), /Name/], [wf({ name: 'x'.repeat(121) }), /Name/], [wf({ extra: 1 }), /Unknown field/], [wf({ enabled: 'yes' }), /Enabled/], [wf({ steps: [] }), /at least one step/], [wf({ steps: 'x' }), /list/], [wf({ trigger: null }), /starts this workflow/], [wf({ trigger: { type: 'cron' } }), /starts this workflow/], [wf({ description: 'x'.repeat(501) }), /Description/]]) rejects(input, pattern);
});

test('triggers are validated, including schedules', () => {
  assert.equal(parseWorkflow(wf({ trigger: { type: 'task_created' } })).trigger.type, 'task_created');
  assert.equal(parseWorkflow(wf({ trigger: { type: 'manual' } })).trigger.type, 'manual');
  assert.deepEqual(parseWorkflow(wf({ trigger: { type: 'schedule', frequency: 'WEEKLY', time: '09:30', timeZone: 'Australia/Sydney', weekday: 1 }, steps: [{ id: 'a', type: 'create_task', title: 'Weekly review' }] })).trigger, { type: 'schedule', frequency: 'WEEKLY', time: '09:30', timeZone: 'Australia/Sydney', weekday: 1 });
  for (const trigger of [{ type: 'task_status_changed' }, { type: 'task_status_changed', toStatus: 'DONE' }, { type: 'task_status_changed', toStatus: 'TODO', fromStatus: 'NOPE' }, { type: 'schedule', frequency: 'HOURLY', time: '09:00', timeZone: 'UTC' }, { type: 'schedule', frequency: 'DAILY', time: '25:00', timeZone: 'UTC' }, { type: 'schedule', frequency: 'DAILY', time: '9:00', timeZone: 'UTC' }, { type: 'schedule', frequency: 'DAILY', time: '09:00', timeZone: 'Not/AZone' }, { type: 'schedule', frequency: 'WEEKLY', time: '09:00', timeZone: 'UTC' }, { type: 'schedule', frequency: 'WEEKLY', time: '09:00', timeZone: 'UTC', weekday: 7 }, { type: 'schedule', frequency: 'MONTHLY', time: '09:00', timeZone: 'UTC', dayOfMonth: 31 }]) rejects(wf({ trigger, steps: [{ id: 'a', type: 'create_task', title: 'x' }] }));
});

test('schedule triggers have no task, so task-based steps and fields are refused up front', () => {
  const schedule = { type: 'schedule', frequency: 'DAILY', time: '09:00', timeZone: 'UTC' };
  rejects(wf({ trigger: schedule, steps: [{ id: 'a', type: 'update_task', status: 'COMPLETED' }] }), /needs a task/);
  rejects(wf({ trigger: schedule, steps: [{ id: 'a', type: 'notify', message: 'x', recipients: 'assignee' }] }), /needs a task/);
  rejects(wf({ trigger: schedule, steps: [{ id: 'a', type: 'create_task', title: 'x', project: 'same' }] }), /needs a task/);
  rejects(wf({ trigger: schedule, steps: [{ id: 'a', type: 'branch', condition: { field: 'task.status', operator: 'equals', value: 'TODO' }, then: [], else: [] }] }), /no task/);
  assert.equal(parseWorkflow(wf({ trigger: schedule, steps: [{ id: 'a', type: 'notify', message: 'x', recipients: 'creator' }] })).steps.length, 1);
});

test('step fields are validated', () => {
  const one = (step) => wf({ steps: [{ id: 'a', ...step }] });
  for (const [step, pattern] of [
    [{ type: 'delay', minutes: 0 }, /Wait/], [{ type: 'delay', minutes: 43_201 }, /Wait/], [{ type: 'delay', minutes: 1.5 }, /Wait/], [{ type: 'delay', minutes: '5' }, /Wait/],
    [{ type: 'create_task', title: '' }, /Task title/], [{ type: 'create_task', title: 'x', priority: 'MAX' }, /Priority/], [{ type: 'create_task', title: 'x', dueInDays: -1 }, /Due in days/], [{ type: 'create_task', title: 'x', project: 'elsewhere' }, /project/], [{ type: 'create_task', title: 'x', assignee: 'bob' }, /assignee/],
    [{ type: 'update_task' }, /at least one change/], [{ type: 'update_task', status: 'DONE' }, /Status/], [{ type: 'update_task', addLabels: ['bad label!'] }, /Labels/], [{ type: 'update_task', addLabels: Array.from({ length: 11 }, (_, i) => `l${i}`) }, /Labels/],
    [{ type: 'notify', message: 'x', recipients: 'everyone' }, /who to notify/], [{ type: 'notify', message: '', recipients: 'creator' }, /Message/], [{ type: 'ai', prompt: '' }, /Prompt/], [{ type: 'ai', prompt: 'x'.repeat(2001) }, /Prompt/], [{ type: 'teleport' }, /step type/],
    [{ type: 'branch', condition: { field: 'task.nope', operator: 'equals', value: 'x' }, then: [], else: [] }, /field/], [{ type: 'branch', condition: { field: 'task.status', operator: 'matches', value: 'x' }, then: [], else: [] }, /compare/], [{ type: 'branch', condition: { field: 'task.status', operator: 'equals' }, then: [], else: [] }, /value/], [{ type: 'branch', condition: { field: 'task.daysUntilDue', operator: 'greater_than', value: 'soon' }, then: [], else: [] }, /number/], [{ type: 'branch', condition: { field: 'steps.ghost.output', operator: 'contains', value: 'x' }, then: [], else: [] }, /field/],
  ]) rejects(one(step), pattern);
  assert.equal(parseWorkflow(one({ type: 'branch', condition: { field: 'task.labels', operator: 'is_not_empty' }, then: [], else: [] })).steps[0].condition.value, undefined);
});

test('ids must be well-formed and unique; size and nesting are capped', () => {
  rejects(wf({ steps: [{ id: 'Bad Id', type: 'delay', minutes: 1 }] }), /short id/);
  rejects(wf({ steps: [{ id: 'a', type: 'delay', minutes: 1 }, { id: 'a', type: 'delay', minutes: 1 }] }), /used twice/);
  rejects(wf({ steps: Array.from({ length: 31 }, (_, i) => ({ id: `s${i}`, type: 'delay', minutes: 1 })) }), /up to 30 steps/);
  const nest = (depth, n = 0) => depth === 0 ? [{ id: `d${n}`, type: 'delay', minutes: 1 }] : [{ id: `b${n}`, type: 'branch', condition: { field: 'task.status', operator: 'equals', value: 'TODO' }, then: nest(depth - 1, n + 1), else: [] }];
  assert.equal(parseWorkflow(wf({ steps: nest(3) })).steps.length, 1);
  rejects(wf({ steps: nest(4) }), /nested/);
});

test('webhook addresses: https only and never internal', () => {
  for (const url of ['http://example.com/x', 'https://localhost/x', 'https://app.localhost/x', 'https://db.internal/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/x', 'https://user:pw@example.com/x', 'ftp://example.com', 'not a url', `https://example.com/${'a'.repeat(500)}`]) assert.throws(() => checkWebhookUrl(url), BadRequestException, url);
  assert.equal(checkWebhookUrl('https://hooks.example.com/abc?x=1').hostname, 'hooks.example.com');
  assert.equal(checkWebhookUrl('http://localhost:8080/x', true).port, '8080');
  rejects(wf({ steps: [{ id: 'a', type: 'webhook', url: 'https://192.168.1.1/x' }] }), /internal/);
});

test('only public IP addresses pass the safety check', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicAddress(ip), true, ip);
  for (const ip of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '100.64.0.1', '100.127.255.255', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.0.1', '192.0.0.1', '192.0.2.1', '198.18.0.1', '198.51.100.7', '203.0.113.9', '224.0.0.1', '255.255.255.255', '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::7f00:1'.replace('7f00:1', '127.0.0.1'), '2001:db8::1', 'not-an-ip', '']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('172.15.0.1'), true);
  assert.equal(isPublicAddress('172.32.0.1'), true);
  assert.equal(isPublicAddress('::ffff:8.8.8.8'), true);
});

const steps = parseWorkflow(wf({ steps: [
  { id: 'a', type: 'delay', minutes: 1 },
  { id: 'b', type: 'branch', condition: { field: 'task.status', operator: 'equals', value: 'TODO' }, then: [{ id: 'c', type: 'delay', minutes: 1 }, { id: 'd', type: 'delay', minutes: 1 }], else: [{ id: 'e', type: 'delay', minutes: 1 }] },
  { id: 'f', type: 'branch', condition: { field: 'task.status', operator: 'equals', value: 'TODO' }, then: [], else: [] },
  { id: 'g', type: 'delay', minutes: 1 },
] })).steps;
const idAt = (path) => path && stepAt(steps, path).id;

test('stepping through the tree follows branches and falls through to the next sibling', () => {
  assert.equal(idAt(nextPath(steps, [0])), 'b');
  assert.equal(idAt(nextPath(steps, [1], 'then')), 'c');
  assert.equal(idAt(nextPath(steps, [1], 'else')), 'e');
  assert.equal(idAt(nextPath(steps, [1, 'then', 0])), 'd');
  assert.equal(idAt(nextPath(steps, [1, 'then', 1])), 'f');
  assert.equal(idAt(nextPath(steps, [1, 'else', 0])), 'f');
  assert.equal(idAt(nextPath(steps, [2], 'then')), 'g');
  assert.equal(nextPath(steps, [3]), null);
  const walk = []; let path = [0];
  while (path) { const step = stepAt(steps, path); walk.push(step.id); path = nextPath(steps, path, step.type === 'branch' ? 'then' : undefined); }
  assert.deepEqual(walk, ['a', 'b', 'c', 'd', 'f', 'g']);
});

const vars = (task, extra = {}) => ({ task, trigger: { type: 'task_status_changed' }, steps: { s1: { output: 'High risk: 7' } }, workflow: { name: 'Flow' }, now: new Date('2026-12-01T12:00:00Z'), ...extra });
const task = { title: 'Ship Launch', description: '', status: 'COMPLETED', priority: 'HIGH', labels: ['Ops', 'launch'], assigneeId: null, projectId: 'p1', dueAt: '2026-12-04T12:00:00.000Z' };
const check = (field, operator, value, t = task) => evaluateCondition({ field, operator, value }, vars(t));

test('conditions compare text case-insensitively and handle labels, empties and numbers', () => {
  assert.equal(check('task.status', 'equals', 'completed'), true);
  assert.equal(check('task.status', 'not_equals', 'TODO'), true);
  assert.equal(check('task.title', 'contains', 'launch'), true);
  assert.equal(check('task.title', 'not_contains', 'nope'), true);
  assert.equal(check('task.labels', 'contains', 'OPS'), true);
  assert.equal(check('task.labels', 'equals', 'launch'), true);
  assert.equal(check('task.labels', 'not_contains', 'urgent'), true);
  assert.equal(check('task.description', 'is_empty'), true);
  assert.equal(check('task.assigneeId', 'is_empty'), true);
  assert.equal(check('task.labels', 'is_not_empty'), true);
  assert.equal(check('task.daysUntilDue', 'greater_than', '2'), true);
  assert.equal(check('task.daysUntilDue', 'less_than', '3'), false);
  assert.equal(check('task.daysUntilDue', 'less_than', '5'), true);
  assert.equal(check('trigger.type', 'equals', 'task_status_changed'), true);
});

test('missing values never throw: they are empty and fail comparisons', () => {
  const noDue = { ...task, dueAt: null, labels: [] };
  assert.equal(check('task.daysUntilDue', 'greater_than', '0', noDue), false);
  assert.equal(check('task.dueAt', 'is_empty', undefined, noDue), true);
  assert.equal(check('task.labels', 'is_empty', undefined, noDue), true);
  assert.equal(evaluateCondition({ field: 'task.status', operator: 'equals', value: 'TODO' }, vars(null)), false);
  assert.equal(evaluateCondition({ field: 'task.status', operator: 'not_equals', value: 'TODO' }, vars(null)), true);
  assert.equal(evaluateCondition({ field: 'steps.s1.output', operator: 'contains', value: 'high risk' }, vars(task)), true);
  assert.equal(evaluateCondition({ field: 'steps.s1.output', operator: 'greater_than', value: '1' }, vars(task)), false);
  assert.equal(evaluateCondition({ field: 'steps.zz.output', operator: 'is_empty' }, vars(task)), true);
});

test('templates fill known fields, blank unknown ones, and cap the length', () => {
  const v = vars(task);
  assert.equal(render('Done: {{task.title}} ({{task.priority}}) due {{task.dueDate}} [{{ task.labels }}]', v), 'Done: Ship Launch (HIGH) due 2026-12-04 [Ops, launch]');
  assert.equal(render('{{steps.s1.output}} | {{workflow.name}} | {{now.date}} | {{trigger.type}}', v), 'High risk: 7 | Flow | 2026-12-01 | task_status_changed');
  assert.equal(render('a{{nope}}b{{task.assigneeId}}c{{steps.ghost.output}}d', v), 'abcd');
  assert.equal(render('{{task.title}}', vars(null)), '');
  assert.equal(render('x'.repeat(50), v, 10).length, 10);
  assert.equal(render('{task.title} {{ task.title', v), '{task.title} {{ task.title');
});

test('schedules fire at the right local time, across weeks, months and daylight saving', () => {
  const at = (schedule, after) => nextScheduledRun({ type: 'schedule', ...schedule }, new Date(after)).toISOString();
  assert.equal(at({ frequency: 'DAILY', time: '09:00', timeZone: 'UTC' }, '2026-12-01T08:00:00Z'), '2026-12-01T09:00:00.000Z');
  assert.equal(at({ frequency: 'DAILY', time: '09:00', timeZone: 'UTC' }, '2026-12-01T09:00:00Z'), '2026-12-02T09:00:00.000Z');
  assert.equal(at({ frequency: 'DAILY', time: '09:00', timeZone: 'Australia/Sydney' }, '2026-12-01T00:00:00Z'), '2026-12-01T22:00:00.000Z');
  assert.equal(at({ frequency: 'WEEKLY', weekday: 1, time: '09:30', timeZone: 'UTC' }, '2026-12-01T12:00:00Z'), '2026-12-07T09:30:00.000Z');
  assert.equal(at({ frequency: 'WEEKLY', weekday: 2, time: '09:30', timeZone: 'UTC' }, '2026-12-01T08:00:00Z'), '2026-12-01T09:30:00.000Z');
  assert.equal(at({ frequency: 'MONTHLY', dayOfMonth: 15, time: '08:00', timeZone: 'UTC' }, '2026-12-16T00:00:00Z'), '2027-01-15T08:00:00.000Z');
  assert.equal(at({ frequency: 'MONTHLY', dayOfMonth: 28, time: '08:00', timeZone: 'UTC' }, '2027-01-31T00:00:00Z'), '2027-02-28T08:00:00.000Z');
  assert.equal(at({ frequency: 'DAILY', time: '09:00', timeZone: 'America/New_York' }, '2026-03-07T20:00:00Z'), '2026-03-08T13:00:00.000Z');
  assert.equal(at({ frequency: 'DAILY', time: '09:00', timeZone: 'America/New_York' }, '2026-03-08T14:00:00Z'), '2026-03-09T13:00:00.000Z');
});

test('retries back off and then give up', () => {
  assert.deepEqual([1, 2, 3, 4].map(retryDelay), [30_000, 120_000, null, null]);
  assert.equal(MAX_ATTEMPTS, 3);
});
