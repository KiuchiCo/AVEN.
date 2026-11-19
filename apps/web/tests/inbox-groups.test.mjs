import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actorSummary, groupUpdates } from '../app/workspace/inbox-groups.ts';

const u = (id, entityId, at, isRead = false, who = 'Ana', entityType = 'TASK') => ({ id, entityId, entityType, message: 'm', createdAt: `2026-03-0${at}T10:00:00Z`, isRead, actor: { displayName: who } });

test('updates about the same item fold together, newest first, and nothing is lost', () => {
  const groups = groupUpdates([u('a', 't1', 1), u('b', 't2', 2), u('c', 't1', 3, true, 'Ben', 'TASK_COMMENT')]);
  assert.deepEqual(groups.map((g) => g.key), ['t1', 't2']);
  assert.deepEqual(groups[0].items.map((i) => i.id), ['c', 'a']);
  assert.equal(groups[0].latest.id, 'c'); assert.equal(groups[0].unread, 1); assert.deepEqual(groups[0].actors, ['Ben', 'Ana']);
  assert.equal(groups.reduce((n, g) => n + g.items.length, 0), 3);
});
test('groups are ordered by their newest update and the input is not changed', () => {
  const input = [u('a', 't1', 5), u('b', 't2', 2), u('c', 't2', 6)];
  const copy = JSON.stringify(input);
  assert.deepEqual(groupUpdates(input).map((g) => g.key), ['t2', 't1']); assert.equal(JSON.stringify(input), copy);
  assert.deepEqual(groupUpdates([]), []);
});
test('actor summaries read naturally', () => {
  assert.equal(actorSummary([]), ''); assert.equal(actorSummary(['Ana']), 'Ana'); assert.equal(actorSummary(['Ana', 'Ben']), 'Ana and Ben');
  assert.equal(actorSummary(['Ana', 'Ben', 'Cy']), 'Ana, Ben and 1 other'); assert.equal(actorSummary(['A', 'B', 'C', 'D']), 'A, B and 2 others');
});
