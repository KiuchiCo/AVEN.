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

  test('Google scopes: the request asks for exactly what AVEN uses, and a connection without the calendar permission is refused, not saved', async () => {
    const { started, location } = await connect('GOOGLE');
    const url = new URL(started.body.url);
    assert.deepEqual(url.searchParams.get('scope').split(' '), ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events']);
    assert.equal(url.searchParams.get('prompt'), 'consent'); assert.equal(url.searchParams.get('access_type'), 'offline'); assert.equal(url.searchParams.get('include_granted_scopes'), 'true');
    assert.match(location, /connected=google/);
    const stored = await t.prisma.calendarConnection.findFirstOrThrow({ where: { workspaceId: W.id, provider: 'GOOGLE' } });
    assert.match(stored.scopes, /auth\/calendar\.events/, 'the granted scopes are recorded');
    // the person unticks the calendar permission on Google's screen: Google still sends tokens, but without it
    const before = (await connections()).length; stub.google.scope = 'openid email';
    try {
      const refused = await connect('GOOGLE');
      assert.match(refused.location, /settings\/connections\?error=Google%20did%20not%20give%20AVEN%20permission/);
      assert.equal((await connections()).length, before, 'nothing was saved');
    } finally { stub.google.scope = 'openid email https://www.googleapis.com/auth/calendar.events'; }
    // a full-calendar grant is also enough
    stub.google.scope = 'openid email https://www.googleapis.com/auth/calendar';
    try { assert.match((await connect('GOOGLE')).location, /connected=google/); } finally { stub.google.scope = 'openid email https://www.googleapis.com/auth/calendar.events'; }
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

  const google = () => t.prisma.calendarConnection.findFirstOrThrow({ where: { workspaceId: W.id, provider: 'GOOGLE' } });
  const run = (id) => svc.syncConnection(id); // straight to the service: these tests make many syncs, more than the per-minute limit on the API route
  const makeDue = (id, minutes = 6) => t.prisma.calendarConnection.update({ where: { id }, data: { lastSyncedAt: new Date(Date.now() - minutes * 60_000) } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Connecting starts a first sync in the background; wait for it, so a test's own sync isn't turned away as "already running". */
  const idle = async (id, since = new Date(0)) => { await sleep(250); for (let i = 0; i < 80; i += 1) { const row = await t.prisma.calendarConnection.findUniqueOrThrow({ where: { id } }); if (!row.syncingSince && row.lastSyncedAt && row.lastSyncedAt > since) return; await sleep(100); } };

  test('automatic sync: the first read is full and leaves a token; later reads use it and fetch only what changed', async () => {
    const c = await google(); await idle(c.id); await run(c.id);
    const row = await t.prisma.calendarConnection.findUniqueOrThrow({ where: { id: c.id } });
    assert.match(row.syncToken, /^tok-\d+$/, 'a sync token was stored'); assert.ok(row.fullSyncedAt);
    stub.google.queries.length = 0; stub.addGoogle('a1', 'Auto one', soon(8), soon(8, 11));
    const added = await run(c.id); assert.equal(added.imported, 1);
    assert.equal(stub.google.queries.length, 1, 'one request'); assert.match(stub.google.queries[0], /syncToken=tok-\d+/); assert.doesNotMatch(stub.google.queries[0], /timeMin/, 'not the whole window again');
    const quiet = await run(c.id); assert.deepEqual([quiet.imported, quiet.updated, quiet.removed], [0, 0, 0]);
    stub.edit(stub.google, 'a1', { summary: 'Auto one (moved)' }); assert.equal((await run(c.id)).updated, 1); assert.ok((await titles()).includes('Auto one (moved)'));
    assert.equal((await events()).filter((e) => e.title.startsWith('Auto one')).length, 1, 'updated in place, not duplicated');
    stub.google.events.delete('a1'); assert.equal((await run(c.id)).removed, 1); assert.equal((await events()).filter((e) => e.title.startsWith('Auto one')).length, 0);
  });

  test('an expired token is refreshed first, and an expired sync token is recovered with a full read', async () => {
    const c = await google(); await idle(c.id); const tokensBefore = stub.google.tokens;
    await t.prisma.calendarConnection.update({ where: { id: c.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    stub.addGoogle('a2', 'Found after refresh', soon(9), soon(9, 11)); assert.equal((await run(c.id)).imported, 1);
    assert.equal(stub.google.tokens, tokensBefore + 1, 'the access token was refreshed once');
    stub.addGoogle('a3', 'Found after recovery', soon(10), soon(10, 11)); stub.google.expireTokens = true; stub.google.queries.length = 0;
    const recovered = await run(c.id); assert.equal(recovered.imported, 1, JSON.stringify(recovered)); assert.equal(recovered.problems.length, 0);
    assert.match(stub.google.queries[0], /syncToken/, 'it tried the token first'); assert.ok(stub.google.queries.slice(1).length >= 1 && stub.google.queries.slice(1).every((q) => /timeMin/.test(q) && !/syncToken/.test(q)), 'then read the whole window');
    assert.match((await t.prisma.calendarConnection.findUniqueOrThrow({ where: { id: c.id } })).syncToken, /^tok-\d+$/, 'and a new token');
  });

  test('repeating events arrive as their individual occurrences at the right instant, whatever time zone Google uses', async () => {
    const c = await google(); await idle(c.id);
    stub.addGoogle('r1_20270105', 'Weekly sync', '2027-01-05T10:00:00+11:00', '2027-01-05T11:00:00+11:00', { recurringEventId: 'r1' });
    stub.addGoogle('r1_20270112', 'Weekly sync', '2027-01-12T10:00:00+11:00', '2027-01-12T11:00:00+11:00', { recurringEventId: 'r1' });
    assert.equal((await run(c.id)).imported, 2);
    const rows = (await events()).filter((e) => e.title === 'Weekly sync').sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    assert.deepEqual(rows.map((e) => e.startsAt), ['2027-01-04T23:00:00.000Z', '2027-01-11T23:00:00.000Z']);
    stub.google.events.delete('r1_20270112'); assert.equal((await run(c.id)).removed, 1, 'one occurrence cancelled in Google');
    assert.equal((await events()).filter((e) => e.title === 'Weekly sync').length, 1);
  });

  test('background sync: a due connection is synced with nobody pressing Sync now, a recent one is left alone, and failures back off', async () => {
    const c = await google(); await idle(c.id); stub.addGoogle('b1', 'Background one', soon(11), soon(11, 11));
    await makeDue(c.id, 1e7); assert.ok(await svc.syncDue() >= 1); assert.ok((await titles()).includes('Background one')); // longest-waiting, so ahead of earlier runs' connections in a reused database
    stub.addGoogle('b2', 'Background two', soon(12), soon(12, 11)); assert.equal(await svc.syncDue(), 0, 'just synced, so not due');
    assert.ok(!(await titles()).includes('Background two'));
    // Google is busy: the failure is recorded and the next attempt is pushed back, not hammered
    stub.google.failWith = 503; await makeDue(c.id); await svc.syncDue();
    let row = await t.prisma.calendarConnection.findUniqueOrThrow({ where: { id: c.id } });
    assert.equal(row.failureCount, 1); assert.equal(row.status, 'ACTIVE'); assert.ok(row.nextAttemptAt.getTime() > Date.now() + 4 * 60_000, 'about five minutes');
    stub.google.failWith = 0; await makeDue(c.id); assert.equal(await svc.syncDue(), 0, 'waiting out the delay');
    await t.prisma.calendarConnection.update({ where: { id: c.id }, data: { nextAttemptAt: null } }); assert.ok(await svc.syncDue() >= 1);
    row = await t.prisma.calendarConnection.findUniqueOrThrow({ where: { id: c.id } }); assert.deepEqual([row.failureCount, row.nextAttemptAt, row.lastError], [0, null, null]);
    assert.ok((await titles()).includes('Background two'), 'recovered and caught up');
    const { retryDelayMs } = await import('../../dist/calendar-sync/calendar-sync.service.js');
    assert.deepEqual([1, 2, 3, 4, 10].map(retryDelayMs), [300_000, 600_000, 1_200_000, 2_400_000, 3_600_000]);
  });

  test('a connection whose connector is no longer an owner or administrator is set aside to reconnect, so it cannot hold up the queue', async () => {
    const c = await google(); await idle(c.id);
    const member = await t.prisma.workspaceMember.findFirstOrThrow({ where: { workspaceId: W.id, role: 'MEMBER' }, select: { userId: true } });
    await t.prisma.calendarConnection.update({ where: { id: c.id }, data: { connectedById: member.userId, lastSyncedAt: new Date(0), nextAttemptAt: null } });
    await svc.syncDue(100);
    const row = await t.prisma.calendarConnection.findUniqueOrThrow({ where: { id: c.id } });
    assert.equal(row.status, 'NEEDS_ATTENTION'); assert.match(row.lastError, /Reconnect to resume/);
    const again = await t.prisma.calendarConnection.findMany({ where: { id: c.id, status: 'ACTIVE' } });
    assert.equal(again.length, 0, 'no longer picked by the background queue');
    await t.prisma.calendarConnection.update({ where: { id: c.id }, data: { connectedById: c.connectedById, status: 'ACTIVE', lastError: null } });
  });

  test('after repeated failures background syncing stops and asks to reconnect; reconnecting restores it', async () => {
    const c = await google(); await idle(c.id); stub.google.failWith = 500;
    for (let i = 0; i < 8; i += 1) { await t.prisma.calendarConnection.update({ where: { id: c.id }, data: { nextAttemptAt: null, syncingSince: null } }); await run(c.id); }
    stub.google.failWith = 0;
    const row = await t.prisma.calendarConnection.findUniqueOrThrow({ where: { id: c.id } });
    assert.equal(row.status, 'NEEDS_ATTENTION'); assert.match(row.lastError, /Reconnect to resume/);
    await makeDue(c.id); const queries = stub.google.queries.length; await svc.syncDue(); assert.equal(stub.google.queries.length, queries, 'not retried in the background');
    stub.google.queries.length = 0; const since = new Date();
    assert.match((await connect('GOOGLE', true)).location, /connected=google/); await idle(c.id, since);
    const fixed = await t.prisma.calendarConnection.findUniqueOrThrow({ where: { id: c.id } }); assert.deepEqual([fixed.status, fixed.failureCount], ['ACTIVE', 0]); assert.match(fixed.syncToken, /^tok-\d+$/);
    assert.ok(/timeMin/.test(stub.google.queries[0]) && !/syncToken/.test(stub.google.queries[0]), 'the first sync after reconnecting is a full read, not the old token');
  });

  test('opening the calendar syncs a stale connection for any member, once per cooldown, and never for outsiders', async () => {
    const c = await google(); await idle(c.id); await run(c.id); stub.addGoogle('o1', 'Seen on opening', soon(13), soon(13, 11)); await makeDue(c.id, 2);
    const first = await t.call('max', 'POST', `${ws()}/refresh`); assert.equal(first.status, 200, JSON.stringify(first.body)); assert.equal(first.body.changed, true);
    assert.ok((await titles()).includes('Seen on opening'));
    const calls = stub.google.queries.length; const second = await t.call('max', 'POST', `${ws()}/refresh`);
    assert.equal(second.body.changed, false); assert.equal(stub.google.queries.length, calls, 'inside the cooldown nothing is fetched');
    await t.user('zed'); assert.ok([403, 404].includes((await t.call('zed', 'POST', `${ws()}/refresh`)).status), 'not a member');
    assert.equal((await t.call(null, 'POST', `${ws()}/refresh`)).status, 401);
    assert.equal((await t.call('max', 'GET', ws())).status, 403, 'members still cannot see the connection details');
  });

  test('a change made in AVEN reaches the calendar shortly afterwards, without a manual sync or waiting for the schedule', async () => {
    await idle((await google()).id); svc.sendInTests = true; svc.pushDelayMs = 50;
    const find = (title) => [...stub.google.events.values(), ...stub.graph.events.values()].find((e) => e.summary === title || e.subject === title);
    const until = async (check) => { for (let i = 0; i < 60 && !check(); i += 1) await sleep(100); return check(); };
    try {
      const made = (await t.call('ora', 'POST', `/workspaces/${W.id}/events`, { title: 'Pushed soon', startsAt: soon(14), endsAt: soon(14, 11) })).body;
      assert.ok(await until(() => find('Pushed soon')), 'created in the connected calendar');
      await t.call('ora', 'PATCH', `/workspaces/${W.id}/events/${made.id}`, { title: 'Pushed soon v2', baseUpdatedAt: made.updatedAt });
      assert.ok(await until(() => find('Pushed soon v2')), 'the edit followed'); assert.equal([...stub.google.events.values(), ...stub.graph.events.values()].filter((e) => /^Pushed soon/.test(e.summary ?? e.subject)).length, 1, 'one copy, not two');
      await t.call('ora', 'DELETE', `/workspaces/${W.id}/events/${made.id}`);
      assert.ok(await until(() => !find('Pushed soon v2')), 'the deletion followed');
    } finally { svc.sendInTests = false; svc.pushDelayMs = 1000 }
  });

  test('after disconnecting Google, background and on-open syncing no longer touch it', async () => {
    const c = await google(); await idle(c.id); assert.equal((await t.call('ora', 'DELETE', `${ws()}/${c.id}`)).status, 200);
    const queries = stub.google.queries.length; await svc.syncDue(); await t.call('max', 'POST', `${ws()}/refresh`);
    assert.equal(stub.google.queries.length, queries); assert.equal(await t.prisma.calendarConnection.count({ where: { workspaceId: W.id, provider: 'GOOGLE' } }), 0);
    const since = new Date(); assert.match((await connect('GOOGLE', true)).location, /connected=google/, 'and it can be connected again'); await idle((await google()).id, since);
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
