import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { parseProfileUpdate } from '../dist/auth/profile.js';
import { workspaceNotificationWhere } from '../dist/productivity/notification-filter.js';

test('profile updates trim the name and accept notification toggles', () => {
  assert.deepEqual(parseProfileUpdate({ displayName: '  Kinori  ', notifyTaskUpdates: false }), { displayName: 'Kinori', notifyTaskUpdates: false });
});

test('profile updates reject empty, oversized and non-string names', () => {
  for (const displayName of ['', '   ', 'x'.repeat(121), 42, null]) assert.throws(() => parseProfileUpdate({ displayName }), BadRequestException);
});

test('notification toggles must be real booleans', () => {
  for (const value of ['false', 0, null]) assert.throws(() => parseProfileUpdate({ notifyTeamActivity: value }), BadRequestException);
});

test('unknown fields, empty bodies and non-objects are rejected', () => {
  for (const body of [{ email: 'a@b.c' }, { role: 'OWNER' }, {}, [], null, 'x']) assert.throws(() => parseProfileUpdate(body), BadRequestException);
});

test('inbox shows both sources by default and stays scoped to the workspace and member', () => {
  const where = workspaceNotificationWhere('w1', 'u1', { notifyTeamActivity: true, notifyTaskUpdates: true });
  assert.equal(where.workspaceId, 'w1');
  assert.deepEqual(where.actorId, { not: 'u1' });
  assert.equal(where.OR.length, 2);
});

test('turning off team activity removes broadcast events but keeps addressed ones', () => {
  const where = workspaceNotificationWhere('w1', 'u1', { notifyTeamActivity: false, notifyTaskUpdates: true });
  assert.equal(where.OR.length, 1);
  assert.deepEqual(where.OR[0].receipts.some, { userId: 'u1', isNotificationTarget: true });
});

test('turning off task updates keeps only broadcast events, never addressed ones', () => {
  const where = workspaceNotificationWhere('w1', 'u1', { notifyTeamActivity: true, notifyTaskUpdates: false });
  assert.equal(where.OR.length, 1);
  assert.equal(where.OR[0].recipientScoped, false);
});

test('turning both off yields no sources, and dismissed items stay excluded', () => {
  const where = workspaceNotificationWhere('w1', 'u1', { notifyTeamActivity: false, notifyTaskUpdates: false });
  assert.deepEqual(where.OR, []);
  assert.ok(where.NOT.receipts.some.dismissedAt);
});

test('dashboard widget visibility accepts known widgets and removes duplicates', () => {
  assert.deepEqual(parseProfileUpdate({ dashboardHiddenWidgets: ['events', 'events', 'stats'] }), { dashboardHiddenWidgets: ['events', 'stats'] });
  assert.deepEqual(parseProfileUpdate({ dashboardHiddenWidgets: [] }), { dashboardHiddenWidgets: [] });
});

test('dashboard widget visibility rejects unknown widgets and non-arrays', () => {
  for (const value of [['nope'], 'stats', null, [1], [{}]]) assert.throws(() => parseProfileUpdate({ dashboardHiddenWidgets: value }), BadRequestException);
});
