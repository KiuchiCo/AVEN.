import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';
import { startStub } from './calendar-stub.mjs';

const soon = (days, hour = 10) => new Date(Date.now() + days * 86_400_000 - (Date.now() % 86_400_000) + hour * 3_600_000).toISOString();

describe('calendar sync', { skip }, () => {
  let t; let stub; let W; let svc;
  const ws = () => `/workspaces/${W.id}/integrations/calendar`;
  const events = async (who = 'ora') => (await t.call(who, 'GET', `/workspaces/${W.id}/events`)).body;
  const titles = async () => (await events()).map((e) => e.title).sort();
  const connect = async (provider, pushEnabled = false) => {
    const started = await t.call('ora', 'POST', `${ws()}/connect`, { provider, pushEnabled }); assert.equal(started.status, 200, JSON.stringify(started.body));
    const state = new URL(started.body.url).searchParams.get('state');
    const response = await fetch(`${t.base}/integrations/calendar/callback?code=abc&state=${encodeURIComponent(state)}`, { redirect: 'manual' });
    return { started, response, location: response.headers.get('location') };
  };
  const patchEvent = async (id, fields) => { const current = (await events()).find((e) => e.id === id); const r = await t.call('ora', 'PATCH', `/workspaces/${W.id}/events/${id}`, { ...fields, baseUpdatedAt: current.updatedAt }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };
  const connections = async () => (await t.call('ora', 'GET', ws())).body.connections;
  const sync = async (id) => (await t.call('ora', 'POST', `${ws()}/${id}/sync`)).body;

  before(async () => {
    stub = await startStub();
    t = await boot({ TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'), GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', GOOGLE_AUTH_URL: `${stub.base}/google/auth`, GOOGLE_TOKEN_URL: `${stub.base}/google/token`, GOOGLE_API_URL: `${stub.base}/google`, MICROSOFT_CLIENT_ID: 'mid', MICROSOFT_CLIENT_SECRET: 'msecret', MICROSOFT_AUTH_URL: `${stub.base}/graph/auth`, MICROSOFT_TOKEN_URL: `${stub.base}/graph/token`, MICROSOFT_API_URL: `${stub.base}/graph`, WEB_ORIGIN: 'http://localhost:3000' });
    for (const name of ['ora', 'max']) await t.user(name);
    W = await t.workspace('ora'); await t.member(W.id, 'max', 'MEMBER');
    const { CalendarSyncService } = await import('../../dist/calendar-sync/calendar-sync.service.js'); svc = t.get(CalendarSyncService);
  });
  after(async () => { await t?.close(); await stub?.close(); });

  test('only owners and administrators can see or change calendar connections', async () => {
    const overview = await t.call('ora', 'GET', ws()); assert.equal(overview.status, 200);
    assert.deepEqual(overview.body.providers.map((p) => [p.key, p.configured]), [['GOOGLE', true], ['MICROSOFT', true]]);
    assert.equal((await t.call('max', 'GET', ws())).status, 403); assert.equal((await t.call('max', 'POST', `${ws()}/connect`, { provider: 'GOOGLE' })).status, 403);
    assert.equal((await t.call('ora', 'POST', `${ws()}/connect`, { provider: 'APPLE' })).status, 400);
  });

  test('connecting goes through the provider, stores encrypted tokens, and a forged sign-in is refused', async () => {
    const forged = await fetch(`${t.base}/integrations/calendar/callback?code=abc&state=forged.value`, { redirect: 'manual' });
    assert.equal(forged.status, 302); assert.match(forged.headers.get('location'), /settings\/connections\?error=/); assert.equal((await connections()).length, 0);
    const denied = await fetch(`${t.base}/integrations/calendar/callback?error=access_denied`, { redirect: 'manual' }); assert.match(denied.headers.get('location'), /error=You%20chose%20not%20to/);
    const { started, location } = await connect('GOOGLE');
    const authUrl = new URL(started.body.url); assert.equal(authUrl.origin + authUrl.pathname, `${stub.base}/google/auth`); assert.equal(authUrl.searchParams.get('client_id'), 'gid'); assert.match(authUrl.searchParams.get('scope'), /calendar\.events/);
    assert.match(location, /settings\/connections\?connected=google/);
    const [c] = await connections(); assert.equal(c.provider, 'GOOGLE'); assert.equal(c.accountEmail, 'google@calendar.test'); assert.equal(c.status, 'ACTIVE');
    const row = await t.prisma.calendarConnection.findUniqueOrThrow({ where: { id: c.id } });
    assert.ok(!row.accessTokenEnc.includes('google-access') && !row.refreshTokenEnc.includes('google-refresh'), 'tokens are not stored in clear text');
    assert.ok(row.accessTokenEnc.startsWith('v1.'));
    assert.deepEqual(Object.keys((await t.call('ora', 'GET', ws())).body.connections[0]).filter((k) => /token/i.test(k)), [], 'tokens are never sent to the browser');
  });

  test('importing is safe to repeat: no duplicates, and provider changes and deletions follow', async () => {
    const [c] = await connections();
    for (const [id, name] of [['g1', 'Standup'], ['g2', 'Planning'], ['g3', 'Review']]) stub.addGoogle(id, name, soon(1), soon(1, 11));
    stub.addGoogle('g4', 'Offsite', '', '', { start: { date: '2026-12-10' }, end: { date: '2026-12-12' } });
    await new Promise((r) => setTimeout(r, 20));
    const first = await sync(c.id); assert.equal(first.imported, 4, JSON.stringify(first)); assert.ok(stub.google.calls.some((x) => x.includes('events?…')), 'it paged through the list');
    assert.deepEqual(await titles(), ['Offsite', 'Planning', 'Review', 'Standup']);
    const offsite = (await events()).find((e) => e.title === 'Offsite'); assert.equal(offsite.isAllDay, true);
    const again = await sync(c.id); assert.deepEqual([again.imported, again.updated, again.removed], [0, 0, 0]); assert.equal((await events()).length, 4, 'a second sync created nothing');
    stub.edit(stub.google, 'g1', { summary: 'Standup (moved)' }); stub.google.events.delete('g2'); stub.google.events.set('g3', { ...stub.google.events.get('g3'), status: 'cancelled' });
    const changed = await sync(c.id); assert.deepEqual([changed.updated, changed.removed], [1, 2], JSON.stringify(changed));
    assert.deepEqual(await titles(), ['Offsite', 'Standup (moved)']);
    const mine = await t.prisma.calendarConnection.findUniqueOrThrow({ where: { id: c.id } }); assert.ok(mine.lastSyncedAt); assert.equal(mine.lastError, null);
  });

  test('an event deleted in AVEN is not brought back, and only deleted at the provider when sending is on', async () => {
    const [c] = await connections();
    const standup = (await events()).find((e) => e.title === 'Standup (moved)');
    assert.equal((await t.call('ora', 'DELETE', `/workspaces/${W.id}/events/${standup.id}`)).status, 200);
    const s = await sync(c.id); assert.equal(s.imported, 0, 'it stayed deleted'); assert.ok(stub.google.events.has('g1'), 'the provider copy was not touched');
    assert.equal((await t.call('ora', 'PATCH', `${ws()}/${c.id}`, { pushEnabled: true })).status, 200);
    await sync(c.id); assert.equal(stub.google.events.has('g1'), false, 'with sending on, the deletion is passed on');
  });

  test('with sending on, AVEN events are sent once, edits follow, and the later edit wins a conflict', async () => {
    const [c] = await connections();
    const made = (await t.call('ora', 'POST', `/workspaces/${W.id}/events`, { title: 'From AVEN', startsAt: soon(2), endsAt: soon(2, 11) })).body;
    await t.call('ora', 'POST', `/workspaces/${W.id}/events`, { title: 'Weekly', startsAt: soon(3), recurrence: 'WEEKLY', recurrenceTimeZone: 'UTC', recurrenceUntil: soon(60) });
    const sent = await sync(c.id); assert.equal(sent.sent, 1, JSON.stringify(sent)); assert.equal(sent.skippedRecurring, 1, 'repeating events are not sent');
    const remoteId = [...stub.google.events.values()].find((e) => e.summary === 'From AVEN').id;
    assert.equal((await sync(c.id)).sent, 0, 'not sent twice'); assert.equal([...stub.google.events.values()].filter((e) => e.summary === 'From AVEN').length, 1);
    await patchEvent(made.id, { title: 'From AVEN v2' });
    assert.equal((await sync(c.id)).sent, 1); assert.equal(stub.google.events.get(remoteId).summary, 'From AVEN v2');
    // Both sides change; the provider edit is made last, so it wins.
    await patchEvent(made.id, { title: 'AVEN edit' }); await new Promise((r) => setTimeout(r, 30));
    stub.edit(stub.google, remoteId, { summary: 'Google edit' });
    const conflict = await sync(c.id); assert.equal(conflict.conflicts, 1); assert.equal((await events()).find((e) => e.id === made.id).title, 'Google edit');
    assert.match((await t.prisma.workspaceActivity.findFirstOrThrow({ where: { workspaceId: W.id, entityType: 'CALENDAR', message: { contains: 'edited in both places' } } })).message, /newer copy from Google Calendar/);
  });

  test('Outlook works the same way through the same engine', async () => {
    const { location } = await connect('MICROSOFT', true); assert.match(location, /connected=microsoft/);
    const c = (await connections()).find((x) => x.provider === 'MICROSOFT'); assert.equal(c.accountEmail, 'graph@calendar.test');
    stub.addGraph('m1', 'Outlook meeting', soon(4), soon(4, 11)); stub.addGraph('m2', 'Outlook two', soon(5), soon(5, 11)); stub.addGraph('m3', 'Outlook three', soon(6), soon(6, 11));
    const first = await sync(c.id); assert.equal(first.imported, 3); assert.ok(stub.graph.calls.some((x) => x.includes('calendarView')));
    assert.equal((await sync(c.id)).imported, 0);
    stub.edit(stub.graph, 'm1', { subject: 'Outlook renamed' }); stub.graph.events.delete('m2');
    const next = await sync(c.id); assert.deepEqual([next.updated, next.removed], [1, 1]);
    assert.ok((await titles()).includes('Outlook renamed')); assert.ok(!(await titles()).includes('Outlook two'));
    const created = (await t.call('ora', 'POST', `/workspaces/${W.id}/events`, { title: 'To Outlook', startsAt: soon(7), endsAt: soon(7, 12) })).body;
    await sync(c.id); const sentOut = [...stub.graph.events.values()].find((e) => e.subject === 'To Outlook'); assert.ok(sentOut, 'sent to Outlook');
    const google = (await connections()).find((x) => x.provider === 'GOOGLE'); await sync(google.id);
    assert.equal([...stub.google.events.values()].some((e) => e.summary === 'To Outlook'), false, 'an AVEN event goes to one calendar only, so it can never appear twice');
    assert.equal([...stub.graph.events.values()].some((e) => e.subject === 'AVEN edit' || e.subject === 'Google edit'), false, 'events imported from Google are not copied into Outlook');
    assert.ok(created.id);
  });

  test('when the provider refuses our tokens the connection asks to be reconnected; nothing is lost', async () => {
    const c = (await connections()).find((x) => x.provider === 'GOOGLE'); const before = (await events()).length;
    await t.prisma.calendarConnection.update({ where: { id: c.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    stub.google.refuseRefresh = true;
    const result = await sync(c.id); assert.ok(result.problems.length);
    const after = (await connections()).find((x) => x.id === c.id); assert.equal(after.status, 'NEEDS_ATTENTION'); assert.match(after.lastError, /revoked|reconnect/i);
    assert.equal((await events()).length, before, 'no events were lost');
    stub.google.refuseRefresh = false; const { location } = await connect('GOOGLE', true); assert.match(location, /connected=google/);
    assert.equal((await connections()).find((x) => x.provider === 'GOOGLE').status, 'ACTIVE', 'reconnecting repairs it');
  });

  test('disconnecting forgets the tokens but keeps the events; a second sync of the same account cannot run at once', async () => {
    const c = (await connections()).find((x) => x.provider === 'MICROSOFT'); const before = (await events()).length;
    await t.prisma.calendarConnection.update({ where: { id: c.id }, data: { syncingSince: new Date() } });
    assert.match((await sync(c.id)).problems[0], /already running/); await t.prisma.calendarConnection.update({ where: { id: c.id }, data: { syncingSince: null } });
    assert.equal((await t.call('max', 'DELETE', `${ws()}/${c.id}`)).status, 403);
    assert.equal((await t.call('ora', 'DELETE', `${ws()}/${c.id}`)).status, 200);
    assert.equal((await connections()).some((x) => x.id === c.id), false); assert.equal(await t.prisma.calendarConnection.count({ where: { id: c.id } }), 0);
    assert.equal((await events()).length, before, 'imported events stay');
    assert.ok(svc);
  });
});
