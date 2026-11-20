import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addChange, queueKey, readQueue, splitConflict, writeQueue } from '../app/workspace/task-offline.ts';

const memory = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }; };
const change = (over = {}) => ({ taskId: 't1', taskTitle: 'Task', fields: { priority: 'HIGH' }, base: { priority: 'LOW' }, ...over });

test('edits to one task fold together, keeping the earliest base', () => {
  let queue = addChange([], change());
  queue = addChange(queue, change({ fields: { priority: 'URGENT', status: 'COMPLETED' }, base: { priority: 'HIGH', status: 'TODO' } }));
  assert.equal(queue.length, 1);
  assert.deepEqual(queue[0].fields, { priority: 'URGENT', status: 'COMPLETED' });
  assert.deepEqual(queue[0].base, { priority: 'LOW', status: 'TODO' });
  assert.equal(addChange(queue, change({ taskId: 't2' })).length, 2);
});

test('putting a field back to where it started removes the edit', () => {
  let queue = addChange([], change());
  queue = addChange(queue, change({ fields: { priority: 'LOW' }, base: { priority: 'HIGH' } }));
  assert.deepEqual(queue, []);
  const labels = addChange([], change({ fields: { labels: ['b', 'a'] }, base: { labels: ['b', 'a'] } }));
  assert.deepEqual(labels, [], 'an unchanged label list is not an edit');
});

test('a conflict keeps what others did and still applies what nobody touched', () => {
  const queue = addChange([], change({ fields: { priority: 'HIGH', status: 'COMPLETED', dueAt: '2026-05-01T00:00:00.000Z', assigneeId: 'u2' }, base: { priority: 'LOW', status: 'TODO', dueAt: null, assigneeId: null } }));
  const current = { priority: 'URGENT', status: 'TODO', dueAt: null, assignee: null };
  const { clean, base, conflicting } = splitConflict(queue[0], current);
  assert.deepEqual(conflicting, ['priority']);
  assert.deepEqual(clean, { status: 'COMPLETED', dueAt: '2026-05-01T00:00:00.000Z', assigneeId: 'u2' });
  assert.deepEqual(base, { status: 'TODO', dueAt: null, assigneeId: null });
  const dated = splitConflict(addChange([], change({ fields: { dueAt: '2026-06-01' }, base: { dueAt: '2026-05-01T00:00:00Z' } }))[0], { dueAt: '2026-05-01T00:00:00.000Z' });
  assert.deepEqual(dated.conflicting, [], 'the same moment written two ways is not a conflict');
});

test('the queue survives a reload, is per person and workspace, and bad data is ignored', () => {
  const store = memory(); const key = queueKey('u1', 'w1');
  assert.notEqual(key, queueKey('u1', 'w2'));
  const queue = addChange([], change());
  assert.equal(writeQueue(store, key, queue), true);
  assert.deepEqual(readQueue(store, key), queue);
  store.setItem(key, '[{"id":1}]'); assert.deepEqual(readQueue(store, key), []);
  store.setItem(key, 'nope'); assert.deepEqual(readQueue(store, key), []);
  writeQueue(store, key, []); assert.equal(store.getItem(key), null);
  assert.equal(writeQueue({ ...store, setItem: () => { throw new Error('full'); } }, key, queue), false);
});
