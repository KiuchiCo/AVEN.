import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planSync } from '../dist/calendar-sync/sync-plan.js';

const day = 86_400_000; const now = Date.now();
const window = { from: new Date(now - 30 * day), to: new Date(now + 180 * day) };
const at = (days) => new Date(now + days * day);
const remote = (id, etag, extra = {}) => ({ id, etag, title: id, description: null, location: null, isAllDay: false, startsAt: at(2), endsAt: null, updatedAt: at(0), cancelled: false, ...extra });
const link = (id, eventId, etag = 'e1', syncedAgo = 1000) => ({ id: `l-${id}`, eventId, externalId: id, etag, localSyncedAt: new Date(now - syncedAgo) });
const local = (id, extra = {}) => ({ id, updatedAt: new Date(now - 5000), startsAt: at(2), recurring: false, ...extra });
const types = (plan) => plan.actions.map((a) => a.type);

test('a full read treats an event missing from the provider as deleted; an incremental read does not', () => {
  const base = { links: [link('g1', 'a')], locals: new Map([['a', local('a')]]), unlinked: [], pushEnabled: false, window };
  assert.deepEqual(types(planSync({ ...base, remote: [] })), ['deleteLocal']);
  assert.deepEqual(types(planSync({ ...base, remote: [], partial: true })), [], 'missing means unchanged');
  assert.deepEqual(types(planSync({ ...base, remote: [remote('g1', 'e1', { cancelled: true })], partial: true })), ['deleteLocal'], 'only an explicit cancellation removes it');
});

test('an incremental read creates and updates what arrived, and ignores events outside the window', () => {
  const links = [link('g1', 'a')]; const locals = new Map([['a', local('a')]]);
  const plan = planSync({ remote: [remote('g1', 'e2'), remote('new', 'e1'), remote('far', 'e1', { startsAt: at(400) }), remote('old', 'e1', { startsAt: at(-90) })], links, locals, unlinked: [], pushEnabled: false, window, partial: true });
  assert.deepEqual(plan.actions.map((a) => [a.type, a.remote?.id]), [['updateLocal', 'g1'], ['createLocal', 'new']]);
});

test('an incremental read still sends AVEN edits and deletions for events that did not change on the provider', () => {
  const edited = local('a', { updatedAt: new Date(now) });
  const sendOn = { remote: [], links: [link('g1', 'a', 'e1', 60_000)], locals: new Map([['a', edited]]), unlinked: [], pushEnabled: true, window, partial: true };
  assert.deepEqual(types(planSync(sendOn)), ['pushUpdate']);
  assert.deepEqual(types(planSync({ ...sendOn, pushEnabled: false })), [], 'nothing is sent when sending is off');
  assert.deepEqual(types(planSync({ ...sendOn, locals: new Map([['a', { ...edited, recurring: true }]]) })), [], 'repeating events are not sent');
  const deleted = { remote: [], links: [link('g1', null)], locals: new Map(), unlinked: [], pushEnabled: true, window, partial: true };
  assert.deepEqual(types(planSync(deleted)), ['pushDelete']);
  assert.deepEqual(types(planSync({ ...deleted, pushEnabled: false })), [], 'kept, so it is never re-imported');
  assert.deepEqual(types(planSync({ ...deleted, remote: [remote('g1', 'e1', { cancelled: true })], pushEnabled: false })), ['dropLink']);
});

test('our own change coming back from the provider is not sent again (no loop)', () => {
  // AVEN pushed an edit and stored the provider's new etag; the next incremental read returns that same etag.
  const plan = planSync({ remote: [remote('g1', 'e9')], links: [link('g1', 'a', 'e9', 1000)], locals: new Map([['a', local('a')]]), unlinked: [], pushEnabled: true, window, partial: true });
  assert.deepEqual(plan.actions, []);
});
