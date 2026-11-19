import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { requireWorkspaceMember } from '../dist/auth/workspace-access.js';

const identity = { issuer: 'https://clerk.example', subject: 'user_external_1' };

function setup({ user = { id: 'user-1' }, member = { role: 'MEMBER' } } = {}) {
  const calls = { user: [], member: [] };
  const prisma = {
    user: { findUnique: async (args) => { calls.user.push(args); return user; } },
    workspaceMember: { findUnique: async (args) => { calls.member.push(args); return member; } },
  };
  return { prisma, calls };
}

test('members get their user id, looked up by issuer and subject', async () => {
  const { prisma, calls } = setup();
  assert.equal(await requireWorkspaceMember(prisma, identity, 'workspace-1'), 'user-1');
  assert.deepEqual(calls.user[0].where.identityIssuer_identitySubject, { identityIssuer: identity.issuer, identitySubject: identity.subject });
});

test('membership is looked up only in the requested workspace', async () => {
  const { prisma, calls } = setup();
  await requireWorkspaceMember(prisma, identity, 'workspace-9');
  assert.deepEqual(calls.member[0].where.workspaceId_userId, { workspaceId: 'workspace-9', userId: 'user-1' });
});

test('non-members receive 404 so other workspaces are not revealed', async () => {
  const { prisma } = setup({ member: null });
  await assert.rejects(requireWorkspaceMember(prisma, identity, 'workspace-2'), NotFoundException);
});

test('identities without an AVEN account are rejected and never reach the membership lookup', async () => {
  const { prisma, calls } = setup({ user: null });
  await assert.rejects(requireWorkspaceMember(prisma, identity, 'workspace-1'), ForbiddenException);
  assert.equal(calls.member.length, 0);
});

test('guests can read but cannot write', async () => {
  const { prisma } = setup({ member: { role: 'GUEST' } });
  assert.equal(await requireWorkspaceMember(prisma, identity, 'workspace-1'), 'user-1');
  await assert.rejects(requireWorkspaceMember(prisma, identity, 'workspace-1', true), ForbiddenException);
});

test('non-guest roles can write', async () => {
  for (const role of ['OWNER', 'ADMINISTRATOR', 'MANAGER', 'MEMBER']) {
    const { prisma } = setup({ member: { role } });
    assert.equal(await requireWorkspaceMember(prisma, identity, 'workspace-1', true), 'user-1');
  }
});
