import assert from 'node:assert/strict';
import test from 'node:test';
import { describeTrigger, emptyTrigger, fromApiStep, fromApiTrigger, newStep, newStepId, outputStepIds, toApiStep, toApiTrigger } from '../app/workspace/automations/workflow-types.ts';

test('step ids are unique and match the pattern the API requires', () => {
  const ids = Array.from({ length: 200 }, () => newStepId());
  assert.equal(new Set(ids).size, 200);
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9_-]{0,31}$/);
});

test('empty optional fields are left out of what is sent', () => {
  assert.deepEqual(toApiStep({ id: 'a', type: 'create_task', title: 'Follow up', description: '', priority: '', dueInDays: '', project: 'same', assignee: '' }), { id: 'a', type: 'create_task', title: 'Follow up', project: 'same' });
  assert.deepEqual(toApiStep({ id: 'a', type: 'create_task', title: 'T', dueInDays: '0' }), { id: 'a', type: 'create_task', title: 'T', dueInDays: 0 });
  assert.deepEqual(toApiStep({ id: 'u', type: 'update_task', status: 'COMPLETED', priority: '', addLabels: ' Ops, ,escalated ' }), { id: 'u', type: 'update_task', status: 'COMPLETED', addLabels: ['Ops', 'escalated'] });
  assert.deepEqual(toApiStep({ id: 'w', type: 'webhook', url: 'https://example.com/h', message: '' }), { id: 'w', type: 'webhook', url: 'https://example.com/h' });
  assert.deepEqual(toApiStep({ id: 'd', type: 'delay', minutes: 90 }), { id: 'd', type: 'delay', minutes: 90 });
});

test('branches send nested steps, and no value for "is empty" checks', () => {
  const branch = { id: 'b', type: 'branch', condition: { field: 'task.labels', operator: 'is_empty', value: 'leftover' }, then: [{ id: 'n', type: 'notify', message: 'hi', recipients: 'creator' }], else: [] };
  assert.deepEqual(toApiStep(branch), { id: 'b', type: 'branch', condition: { field: 'task.labels', operator: 'is_empty' }, then: [{ id: 'n', type: 'notify', message: 'hi', recipients: 'creator' }], else: [] });
  assert.equal(toApiStep({ ...branch, condition: { field: 'task.status', operator: 'equals', value: 'TODO' } }).condition.value, 'TODO');
});

test('a saved workflow survives a round trip through the editor', () => {
  const saved = { id: 'b', type: 'branch', condition: { field: 'task.priority', operator: 'equals', value: 'HIGH' }, then: [{ id: 'c', type: 'create_task', title: 'X', dueInDays: 3, project: 'same', assignee: 'trigger' }, { id: 'u', type: 'update_task', addLabels: ['a', 'b'], status: 'IN_REVIEW' }], else: [{ id: 'd', type: 'delay', minutes: 60 }] };
  assert.deepEqual(toApiStep(fromApiStep(saved)), saved);
});

test('triggers convert both ways and read clearly', () => {
  assert.deepEqual(toApiTrigger({ ...emptyTrigger(), type: 'task_status_changed', toStatus: 'COMPLETED', fromStatus: '' }), { type: 'task_status_changed', toStatus: 'COMPLETED' });
  assert.deepEqual(toApiTrigger({ ...emptyTrigger(), type: 'schedule', frequency: 'WEEKLY', weekday: '1', time: '09:30', timeZone: 'UTC' }), { type: 'schedule', frequency: 'WEEKLY', time: '09:30', timeZone: 'UTC', weekday: 1 });
  assert.deepEqual(toApiTrigger({ ...emptyTrigger(), type: 'schedule', frequency: 'MONTHLY', dayOfMonth: '15', time: '08:00', timeZone: 'UTC' }), { type: 'schedule', frequency: 'MONTHLY', time: '08:00', timeZone: 'UTC', dayOfMonth: 15 });
  const raw = { type: 'schedule', frequency: 'WEEKLY', weekday: 1, time: '09:30', timeZone: 'Australia/Sydney' };
  assert.deepEqual(toApiTrigger(fromApiTrigger(raw)), raw);
  assert.equal(describeTrigger({ type: 'task_status_changed', toStatus: 'IN_REVIEW', fromStatus: 'TODO' }), 'When a task becomes in review (from to do)');
  assert.equal(describeTrigger(raw), 'Every Monday at 09:30 (Australia/Sydney)');
  assert.equal(describeTrigger({ type: 'manual' }), 'Run by hand');
});

test('new steps start with usable defaults, and outputs can be referenced from later steps', () => {
  assert.deepEqual(newStep('delay').minutes, 60);
  assert.equal(newStep('branch').condition.operator, 'equals');
  assert.equal(newStep('notify').recipients, 'creator');
  const steps = [{ id: 'a', type: 'ai' }, { id: 'b', type: 'branch', condition: { field: 'x', operator: 'equals' }, then: [{ id: 'c', type: 'webhook' }], else: [{ id: 'd', type: 'delay' }, { id: 'e', type: 'create_task' }] }, { id: 'f', type: 'notify' }];
  assert.deepEqual(outputStepIds(steps), ['a', 'c', 'e']);
});
