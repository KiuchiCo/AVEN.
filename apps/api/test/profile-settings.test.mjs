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
  assert.deepEqual(where.AND, [{ OR: [{ actorId: { not: 'u1' } }, { entityType: 'WORKFLOW' }] }]);
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

test('your own changes are hidden from your Inbox, but workflow notices about you are not', () => {
  const where = workspaceNotificationWhere('w1', 'u1', { notifyTeamActivity: true, notifyTaskUpdates: true });
  const [{ OR: either }] = where.AND;
  assert.ok(either.some((clause) => clause.actorId?.not === 'u1'));
  assert.ok(either.some((clause) => clause.entityType === 'WORKFLOW'));
});

test('time zone must be a real IANA zone, or null to follow the device', () => {
  assert.equal(parseProfileUpdate({ timeZone: 'Australia/Sydney' }).timeZone, 'Australia/Sydney');
  assert.equal(parseProfileUpdate({ timeZone: 'UTC' }).timeZone, 'UTC');
  assert.equal(parseProfileUpdate({ timeZone: null }).timeZone, null);
  for (const bad of ['Mars/Olympus', '', 'x'.repeat(65), 5, undefined]) assert.throws(() => parseProfileUpdate({ timeZone: bad }), /time zone|Provide at least one/);
});

test('language must be a supported one or null', async () => {
  const { parseProfileUpdate, languages } = await import('../dist/auth/profile.js');
  assert.deepEqual([...languages], ['en', 'es', 'fr', 'de']);
  assert.equal(parseProfileUpdate({ language: 'es' }).language, 'es');
  assert.equal(parseProfileUpdate({ language: null }).language, null);
  assert.throws(() => parseProfileUpdate({ language: 'xx' }), /supported language/);
  assert.throws(() => parseProfileUpdate({ language: 5 }), /supported language/);
});
