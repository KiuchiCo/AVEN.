import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { decryptToken, encryptToken, signState, verifyState } from '../dist/calendar-sync/token-crypto.js';
import { fromAllDayDates, sameContent, toAllDayDates, toContent } from '../dist/calendar-sync/remote-events.js';
import { planSync } from '../dist/calendar-sync/sync-plan.js';

const key = randomBytes(32);
test('tokens round-trip, are different each time, and cannot be changed or read with another key', () => {
  const a = encryptToken(key, 'ya29.secret'); const b = encryptToken(key, 'ya29.secret');
  assert.notEqual(a, b); assert.ok(!a.includes('secret')); assert.equal(decryptToken(key, a), 'ya29.secret');
  const parts = a.split('.'); parts[3] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => decryptToken(key, parts.join('.'))); assert.throws(() => decryptToken(randomBytes(32), a)); assert.throws(() => decryptToken(key, 'nope'));
});
test('the OAuth state is signed, expires, and is refused when altered', () => {
  const s = { workspaceId: 'w', userId: 'u', provider: 'GOOGLE', pushEnabled: true };
  const signed = signState(key, s, 1000);
  assert.deepEqual(verifyState(key, signed, 2000), s);
  assert.equal(verifyState(key, signed, 1000 + 11 * 60_000), null, 'expired');
  assert.equal(verifyState(randomBytes(32), signed, 2000), null, 'another key');
  const [payload, sig] = signed.split('.'); const forged = Buffer.from(JSON.stringify({ ...s, workspaceId: 'other', exp: 9e15 })).toString('base64url');
  assert.equal(verifyState(key, `${forged}.${sig}`, 2000), null, 'a changed payload'); assert.equal(verifyState(key, 'garbage', 2000), null); assert.ok(payload);
});
test('all-day dates convert both ways using AVEN’s noon-UTC convention', () => {
  const one = fromAllDayDates('2026-03-10', '2026-03-11'); assert.equal(one.startsAt.toISOString(), '2026-03-10T12:00:00.000Z'); assert.equal(one.endsAt, null);
  const three = fromAllDayDates('2026-03-10', '2026-03-13'); assert.equal(three.endsAt.toISOString(), '2026-03-12T12:00:00.000Z');
  assert.deepEqual(toAllDayDates(three.startsAt, three.endsAt), { start: '2026-03-10', endExclusive: '2026-03-13' });
  assert.deepEqual(toAllDayDates(one.startsAt, null), { start: '2026-03-10', endExclusive: '2026-03-11' });
});
test('provider events are fitted to AVEN’s limits and compared by content', () => {
  const remote = { id: 'r', etag: 'e', title: '  ', description: 'd'.repeat(3000), location: null, isAllDay: false, startsAt: new Date('2026-01-01T10:00:00Z'), endsAt: new Date('2026-01-01T09:00:00Z'), updatedAt: new Date(), cancelled: false };
  const c = toContent(remote); assert.equal(c.title, 'Untitled event'); assert.equal(c.description.length, 2000); assert.equal(c.endsAt, null, 'an end before the start is dropped');
  assert.ok(sameContent(c, { ...c })); assert.equal(sameContent(c, { ...c, title: 'x' }), false);
});

// ---- the planner ----
const T = (s) => new Date(`2026-03-${s}:00Z`);
const window = { from: T('01T00:00'), to: T('31T23:59') };
const remote = (id, etag, updated = '05T10:00', extra = {}) => ({ id, etag, title: id, description: null, location: null, isAllDay: false, startsAt: T('10T09:00'), endsAt: null, updatedAt: T(updated), cancelled: false, ...extra });
const local = (id, updated = '01T10:00', extra = {}) => ({ id, updatedAt: T(updated), startsAt: T('10T09:00'), recurring: false, ...extra });
const link = (externalId, eventId, etag = 'e1', synced = '02T10:00') => ({ id: `l-${externalId}`, eventId, externalId, etag, localSyncedAt: T(synced) });
const plan = (o) => planSync({ remote: [], links: [], locals: new Map(), unlinked: [], pushEnabled: false, window, ...o });
const types = (p) => p.actions.map((a) => a.type);

test('new provider events are imported once; running the same sync again does nothing', () => {
  assert.deepEqual(types(plan({ remote: [remote('a', 'e1'), remote('a', 'e1')] })), ['createLocal', 'createLocal'].slice(0, 1));
  const after = plan({ remote: [remote('a', 'e1')], links: [link('a', 'ev1')], locals: new Map([['ev1', local('ev1')]]) });
  assert.deepEqual(after.actions, [], 'nothing changed, nothing to do');
});
test('a change on one side is copied to the other', () => {
  const locals = new Map([['ev1', local('ev1')]]);
  assert.deepEqual(types(plan({ remote: [remote('a', 'e2')], links: [link('a', 'ev1')], locals })), ['updateLocal']);
  const edited = new Map([['ev1', local('ev1', '03T10:00')]]);
  assert.deepEqual(plan({ remote: [remote('a', 'e1')], links: [link('a', 'ev1')], locals: edited }).actions, [], 'edits stay in AVEN when sending is off');
  assert.deepEqual(types(plan({ remote: [remote('a', 'e1')], links: [link('a', 'ev1')], locals: edited, pushEnabled: true })), ['pushUpdate']);
});
test('when both sides changed the later edit wins, and the provider wins if AVEN is not sending', () => {
  const links = [link('a', 'ev1')]; const edited = (at) => new Map([['ev1', local('ev1', at)]]);
  const remoteNewer = plan({ remote: [remote('a', 'e2', '06T10:00')], links, locals: edited('04T10:00'), pushEnabled: true }).actions[0];
  assert.equal(remoteNewer.type, 'updateLocal'); assert.equal(remoteNewer.conflict, true);
  const localNewer = plan({ remote: [remote('a', 'e2', '04T10:00')], links, locals: edited('06T10:00'), pushEnabled: true }).actions[0];
  assert.equal(localNewer.type, 'pushUpdate'); assert.equal(localNewer.conflict, true); assert.equal(localNewer.etag, 'e2', 'it overwrites the version it just saw');
  assert.equal(plan({ remote: [remote('a', 'e2', '04T10:00')], links, locals: edited('06T10:00'), pushEnabled: false }).actions[0].type, 'updateLocal');
});
test('a deletion on the provider removes the event here, but only inside the synced window', () => {
  const links = [link('a', 'ev1'), link('b', 'ev2')];
  const locals = new Map([['ev1', local('ev1')], ['ev2', local('ev2', '01T10:00', { startsAt: new Date('2025-01-01T09:00:00Z') })]]);
  assert.deepEqual(plan({ links, locals }).actions.map((a) => [a.type, a.eventId]), [['deleteLocal', 'ev1']], 'the old event is just out of range, not deleted');
  assert.deepEqual(types(plan({ remote: [remote('a', 'e1', '05T10:00', { cancelled: true })], links: [link('a', 'ev1')], locals })), ['deleteLocal']);
});
test('an event deleted in AVEN stays deleted: not re-imported, and only deleted remotely when sending is on', () => {
  const tomb = [link('a', null)];
  assert.deepEqual(plan({ remote: [remote('a', 'e1')], links: tomb }).actions, []);
  assert.deepEqual(types(plan({ remote: [remote('a', 'e1')], links: tomb, pushEnabled: true })), ['pushDelete']);
  assert.deepEqual(types(plan({ remote: [], links: tomb })), ['dropLink']);
});
test('AVEN events are sent only when sending is on, once, never when repeating, never when out of range', () => {
  const unlinked = [local('n1'), local('n2', '01T10:00', { recurring: true }), local('n3', '01T10:00', { startsAt: new Date('2030-01-01T00:00:00Z') })];
  assert.deepEqual(plan({ unlinked }).actions, []);
  const sent = plan({ unlinked, pushEnabled: true }); assert.deepEqual(sent.actions, [{ type: 'pushCreate', eventId: 'n1' }]); assert.equal(sent.skippedRecurring, 1);
});
