import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { TaskCollaborationAccess } from '../dist/productivity/task-collaboration/task-collaboration.access.js';

const identity = { issuer: 'https://clerk.example', subject: 'user_external_1' };

function setup({ member = { role: 'MEMBER' }, task = { id: 'task-1', title: 'Workspace task' } } = {}) {
  const calls = { user: [], membership: [], task: [] };
  const prisma = {
    user: { findUnique: async (args) => { calls.user.push(args); return { id: 'user-1' }; } },
    workspaceMember: { findUnique: async (args) => { calls.membership.push(args); return member; } },
    task: { findFirst: async (args) => { calls.task.push(args); return task; } },
  };
  return { access: new TaskCollaborationAccess(prisma), calls };
}

test('task access scopes both membership and task lookup to the requested workspace', async () => {
  const { access, calls } = setup();
  const result = await access.require(identity, 'workspace-1', 'task-1');

  assert.equal(result.userId, 'user-1');
  assert.deepEqual(calls.membership[0].where.workspaceId_userId, { workspaceId: 'workspace-1', userId: 'user-1' });
  assert.deepEqual(calls.task[0].where, { id: 'task-1', workspaceId: 'workspace-1' });
});

test('non-members cannot probe whether a task exists in another workspace', async () => {
  const { access, calls } = setup({ member: null });

  await assert.rejects(access.require(identity, 'workspace-2', 'task-1'), NotFoundException);
  assert.equal(calls.task.length, 0);
});

test('a task ID from another workspace is not accessible', async () => {
  const { access } = setup({ task: null });

  await assert.rejects(access.require(identity, 'workspace-2', 'task-1'), NotFoundException);
});

test('guest membership allows reads but rejects writes before task access', async () => {
  const read = setup({ member: { role: 'GUEST' } });
  await read.access.require(identity, 'workspace-1', 'task-1');
  assert.equal(read.calls.task.length, 1);

  const write = setup({ member: { role: 'GUEST' } });
  await assert.rejects(write.access.require(identity, 'workspace-1', 'task-1', true), ForbiddenException);
  assert.equal(write.calls.task.length, 0);
});
