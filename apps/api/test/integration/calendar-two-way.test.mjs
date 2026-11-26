import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';
import { startStub } from './calendar-stub.mjs';

// Two-way Google Calendar sync against a local stand-in for Google (no real Google account is used here).
const soon = (days, hour = 10) => new Date(Date.now() + days * 86_400_000 - (Date.now() % 86_400_000) + hour * 3_600_000).toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('Google Calendar, both directions', { skip }, () => {
  let t; let stub; let W; let svc; let conn;
  const ws = () => `/workspaces/${W.id}/integrations/calendar`;
  const local = async (who = 'ora') => (await t.call(who, 'GET', `/workspaces/${W.id}/events`)).body;
  const revision = async (who = 'ora') => (await t.call(who, 'GET', `/workspaces/${W.id}/events/revision`)).body.revision;
  const google = () => [...stub.google.events.values()];
  const run = (id = conn.id) => svc.syncConnection(id);
  const create = async (title, days = 2) => { const r = await t.call('ora', 'POST', `/workspaces/${W.id}/events`, { title, startsAt: soon(days), endsAt: soon(days, 11) }); assert.ok(r.status < 300, JSON.stringify(r.body)); return r.body; };
  const rename = async (id, title) => { await sleep(25); const current = (await local()).find((e) => e.id === id); const r = await t.call('ora', 'PATCH', `/workspaces/${W.id}/events/${id}`, { title, baseUpdatedAt: current.updatedAt }); assert.equal(r.status, 200, JSON.stringify(r.body)); };
  const pending = async () => (await t.call('ora', 'GET', ws())).body.connections.find((c) => c.id === conn.id).pendingOutbound;
  const links = () => t.prisma.externalEventLink.findMany({ where: { connectionId: conn.id } });
  const idle = async (since) => { await sleep(250); for (let i = 0; i < 80; i += 1) { const row = await t.prisma.calendarConnection.findUniqueOrThrow({ where: { id: conn.id } }); if (!row.syncingSince && row.lastSyncedAt && row.lastSyncedAt > since) return; await sleep(100); } };
  const connect = async (pushEnabled) => {
    const started = await t.call('ora', 'POST', `${ws()}/connect`, { provider: 'GOOGLE', pushEnabled }); assert.equal(started.status, 200);
    const state = new URL(started.body.url).searchParams.get('state');
    const response = await fetch(`${t.base}/integrations/calendar/callback?code=abc&state=${encodeURIComponent(state)}`, { redirect: 'manual' });
    return response.headers.get('location');
  };

  before(async () => {
    stub = await startStub();
    t = await boot({ TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'), GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', GOOGLE_AUTH_URL: `${stub.base}/google/auth`, GOOGLE_TOKEN_URL: `${stub.base}/google/token`, GOOGLE_API_URL: `${stub.base}/google`, WEB_ORIGIN: 'http://localhost:3000' });
    for (const name of ['ora', 'max', 'zed']) await t.user(name);
    W = await t.workspace('ora'); await t.member(W.id, 'max', 'MEMBER');
    const { CalendarSyncService } = await import('../../dist/calendar-sync/calendar-sync.service.js'); svc = t.get(CalendarSyncService);
    const since = new Date(); assert.match(await connect(true), /connected=google/);
    conn = await t.prisma.calendarConnection.findFirstOrThrow({ where: { workspaceId: W.id, provider: 'GOOGLE' } }); await idle(since);
  });
  after(async () => { await t?.close(); await stub?.close(); });

  test('Google → AVEN: a new event, a new title and a new time all arrive in the same AVEN event, never as a copy', async () => {
    const r0 = await revision();
    stub.addGoogle('gx1', 'Planning', soon(3), soon(3, 11));
    assert.equal((await run()).imported, 1);
    const r1 = await revision(); assert.notEqual(r1, r0, 'the revision moved, so an open calendar knows to reload');
    const first = (await local()).find((e) => e.title === 'Planning'); assert.ok(first);
    stub.edit(stub.google, 'gx1', { summary: 'Planning (renamed)' });
    const titled = await run(); assert.equal(titled.updated, 1); assert.equal(titled.imported, 0);
    const r2 = await revision(); assert.notEqual(r2, r1);
    let rows = (await local()).filter((e) => /^Planning/.test(e.title)); assert.equal(rows.length, 1, 'no duplicate'); assert.equal(rows[0].id, first.id, 'the same AVEN event'); assert.equal(rows[0].title, 'Planning (renamed)');
    stub.edit(stub.google, 'gx1', { start: { dateTime: soon(4, 14) }, end: { dateTime: soon(4, 15) } });
    assert.equal((await run()).updated, 1); assert.notEqual(await revision(), r2);
    rows = (await local()).filter((e) => /^Planning/.test(e.title)); assert.equal(rows.length, 1);
    assert.equal(new Date(rows[0].startsAt).toISOString(), new Date(soon(4, 14)).toISOString(), 'the new time');
    assert.equal(rows[0].id, first.id);
    const quiet = await revision(); await run(); assert.equal(await revision(), quiet, 'a sync that finds nothing leaves the revision alone');
  });

  test('the revision is for members only and is cheap to ask for', async () => {
    assert.match(await revision('max'), /^\d+-\d+$/);
    assert.equal((await t.call(null, 'GET', `/workspaces/${W.id}/events/revision`)).status, 401);
    assert.ok([403, 404].includes((await t.call('zed', 'GET', `/workspaces/${W.id}/events/revision`)).status), 'an outsider is refused');
  });

  test('AVEN → Google: an event is sent once, its edits follow, and the Google id and etag are stored', async () => {
    const made = await create('From AVEN');
    await run(); const copies = () => google().filter((e) => e.summary === 'From AVEN' || e.summary === 'From AVEN v2');
    assert.equal(copies().length, 1); assert.match(copies()[0].id, /^avn[0-9a-f]{40}$/, 'a stable id, so a retry cannot make a second copy');
    const link = (await links()).find((l) => l.eventId === made.id); assert.ok(link); assert.equal(link.externalId, copies()[0].id); assert.ok(link.etag);
    await run(); assert.equal(copies().length, 1, 'running again sends nothing new');
    await rename(made.id, 'From AVEN v2'); await run();
    assert.equal(copies().length, 1); assert.equal(copies()[0].summary, 'From AVEN v2');
    assert.equal((await links()).filter((l) => l.eventId === made.id).length, 1);
  });

  test('a change that came from Google is not sent back, and an AVEN change is not seen as a Google change (no loops)', async () => {
    const made = await create('Loop check'); await run(); const id = google().find((e) => e.summary === 'Loop check').id;
    const before = stub.google.mutations.length;
    const again = await run(); assert.deepEqual([again.sent, again.updated, again.imported, again.removed], [0, 0, 0, 0]);
    stub.edit(stub.google, id, { summary: 'Loop check (edited in Google)' });
    const inbound = await run(); assert.equal(inbound.updated, 1); assert.equal(inbound.sent, 0, 'not sent straight back');
    assert.equal(stub.google.mutations.slice(before).filter((m) => m.startsWith('PUT') || m.startsWith('POST')).length, 0, 'AVEN made no request to Google for it');
    assert.equal((await local()).find((e) => e.id === made.id).title, 'Loop check (edited in Google)');
    await rename(made.id, 'Loop check (edited in AVEN)'); const outbound = await run(); assert.equal(outbound.sent, 1); assert.equal(outbound.updated, 0);
    assert.equal((await run()).sent, 0); assert.equal(google().filter((e) => /^Loop check/.test(e.summary)).length, 1);
  });

  test('Google is down: the AVEN event is saved and shown, the change waits as pending, and retries make exactly one copy', async () => {
    stub.google.failMutations = 503;
    const made = await create('While Google is down');
    assert.ok((await local()).some((e) => e.id === made.id), 'saved in AVEN straight away');
    const failed = await run(); assert.ok(failed.problems.length, 'the failure is reported');
    assert.equal(google().filter((e) => e.summary === 'While Google is down').length, 0);
    assert.ok(await pending() >= 1, 'shown as waiting to be sent');
    assert.ok((await local()).some((e) => e.id === made.id), 'still in AVEN');
    await run(); await run(); assert.equal(google().filter((e) => e.summary === 'While Google is down').length, 0, 'retrying while it is down creates nothing');
    stub.google.failMutations = 0;
    await run(); assert.equal(google().filter((e) => e.summary === 'While Google is down').length, 1, 'one copy once Google is back');
    await run(); assert.equal(google().filter((e) => e.summary === 'While Google is down').length, 1);
    assert.equal(await pending(), 0, 'the pending status cleared');
  });

  test('Google makes the event but the answer is lost: the retry finds that copy instead of making another', async () => {
    stub.google.dropNextResponse = true;
    const made = await create('Lost answer');
    const first = await run(); assert.ok(first.problems.length, 'the first attempt looked like a failure');
    assert.equal(google().filter((e) => e.summary === 'Lost answer').length, 1, 'but Google did make it');
    assert.equal((await links()).filter((l) => l.eventId === made.id).length, 0, 'AVEN did not know yet');
    await run(); assert.equal(google().filter((e) => e.summary === 'Lost answer').length, 1, 'no second copy');
    assert.equal((await links()).filter((l) => l.eventId === made.id).length, 1, 'now linked');
    assert.equal(await pending(), 0);
  });

  test('two syncs at the same moment send an event only once', async () => {
    await create('Race');
    const results = await Promise.all([run(), run(), run()]);
    assert.equal(results.filter((r) => r !== null).length, 1, 'one ran, the others stood aside');
    assert.equal(google().filter((e) => e.summary === 'Race').length, 1);
  });

  test('deleting in AVEN deletes the linked Google event only, and it never comes back', async () => {
    stub.addGoogle('other1', 'Someone else’s dentist', soon(5), soon(5, 11)); await run();
    const mine = await create('To be deleted'); await run(); const id = google().find((e) => e.summary === 'To be deleted').id;
    assert.ok((await local()).some((e) => e.title === 'Someone else’s dentist'), 'the unrelated event is in AVEN too');
    assert.equal((await t.call('ora', 'DELETE', `/workspaces/${W.id}/events/${mine.id}`)).status, 200);
    assert.ok(!(await local()).some((e) => e.id === mine.id), 'gone from AVEN at once');
    await run();
    assert.equal(google().some((e) => e.id === id), false, 'removed from Google');
    assert.ok(stub.google.events.has('other1'), 'the unrelated Google event is untouched'); assert.ok((await local()).some((e) => e.title === 'Someone else’s dentist'));
    assert.deepEqual(stub.google.mutations.filter((m) => m.startsWith('DELETE')).filter((m) => m !== `DELETE ${id}` && !m.startsWith('DELETE avn')), [], 'only AVEN-sent events were ever deleted');
    // a later full read must not bring it back
    await t.prisma.calendarConnection.update({ where: { id: conn.id }, data: { syncToken: null, fullSyncedAt: null } });
    await run(); assert.ok(!(await local()).some((e) => e.title === 'To be deleted'), 'not re-imported');
    assert.equal(await pending(), 0);
  });

  test('Google is down while deleting: the deletion is kept and retried until it goes through', async () => {
    const mine = await create('Delete when Google is back'); await run(); const id = google().find((e) => e.summary === 'Delete when Google is back').id;
    stub.google.failMutations = 503;
    await t.call('ora', 'DELETE', `/workspaces/${W.id}/events/${mine.id}`);
    assert.ok(!(await local()).some((e) => e.id === mine.id), 'deleted in AVEN');
    await run(); await run(); assert.ok(stub.google.events.has(id), 'still in Google while it is down');
    const tombstone = (await links()).find((l) => l.externalId === id); assert.ok(tombstone && tombstone.eventId === null, 'AVEN remembers what to delete');
    assert.ok(await pending() >= 1);
    await run(); assert.ok(stub.google.events.has(id), 'and it was not recreated in AVEN'); assert.ok(!(await local()).some((e) => e.title === 'Delete when Google is back'));
    stub.google.failMutations = 0; await run();
    assert.equal(stub.google.events.has(id), false, 'deleted once Google is back');
    assert.equal((await links()).some((l) => l.externalId === id), false); assert.equal(await pending(), 0);
  });

  test('an event deleted before it was ever sent does not touch Google', async () => {
    const made = await create('Never sent'); await t.call('ora', 'DELETE', `/workspaces/${W.id}/events/${made.id}`);
    const before = stub.google.mutations.length; await run();
    assert.deepEqual(stub.google.mutations.slice(before), [], 'no request to Google at all');
  });

  test('reconnecting keeps the "send AVEN events" choice; turning it off stops sending and nothing is lost', async () => {
    const since = new Date(); assert.match(await connect(false), /connected=google/); await idle(since);
    assert.equal((await t.prisma.calendarConnection.findUniqueOrThrow({ where: { id: conn.id } })).pushEnabled, true, 'reconnecting did not switch it off');
    assert.equal((await t.call('ora', 'PATCH', `${ws()}/${conn.id}`, { pushEnabled: false })).status, 200);
    const made = await create('Kept in AVEN only'); await run();
    assert.equal(google().filter((e) => e.summary === 'Kept in AVEN only').length, 0, 'not sent while sending is off');
    assert.ok((await local()).some((e) => e.id === made.id));
    assert.equal(await pending(), 0, 'nothing is reported as pending when sending is off');
    const unsent = async () => (await t.call('ora', 'GET', ws())).body.connections.find((c) => c.id === conn.id).unsentEvents;
    assert.ok(await unsent() >= 1, 'the card can say how many events turning sending on would send');
    assert.equal((await t.call('ora', 'PATCH', `${ws()}/${conn.id}`, { pushEnabled: true })).status, 200); await run();
    assert.equal(google().filter((e) => e.summary === 'Kept in AVEN only').length, 1, 'turned back on, it is sent once');
    assert.equal(await unsent(), 0, 'and nothing is left unsent');
  });

  test('"send only new events": what already exists in AVEN stays out of Google, events made afterwards are sent', async () => {
    assert.equal((await t.call('ora', 'PATCH', `${ws()}/${conn.id}`, { pushEnabled: false })).status, 200);
    const old = await create('Existing before opt-in'); await run();
    assert.equal((await t.call('ora', 'PATCH', `${ws()}/${conn.id}`, { pushEnabled: true, existing: 'maybe' })).status, 400, 'only send or skip are accepted');
    assert.equal((await t.call('ora', 'PATCH', `${ws()}/${conn.id}`, { pushEnabled: true, existing: 'skip' })).status, 200);
    await sleep(25); await create('Made after opt-in'); await run();
    assert.equal(google().filter((e) => e.summary === 'Existing before opt-in').length, 0, 'the old event was not sent');
    assert.equal(google().filter((e) => e.summary === 'Made after opt-in').length, 1, 'the new one was');
    assert.equal(await pending(), 0, 'the skipped event is not reported as pending');
    assert.ok((await local()).some((e) => e.id === old.id));
    assert.equal((await t.call('ora', 'PATCH', `${ws()}/${conn.id}`, { pushEnabled: false })).status, 200);
    assert.equal((await t.call('ora', 'PATCH', `${ws()}/${conn.id}`, { pushEnabled: true, existing: 'send' })).status, 200); await run();
    assert.equal(google().filter((e) => e.summary === 'Existing before opt-in').length, 1, 'choosing "send" afterwards sends it once');
  });

  test('another workspace cannot trigger or reach this calendar', async () => {
    const other = await t.workspace('zed'); const calls = stub.google.queries.length;
    const own = await t.call('zed', 'POST', `/workspaces/${other.id}/integrations/calendar/refresh`); assert.equal(own.status, 200); assert.equal(own.body.changed, false);
    assert.equal(stub.google.queries.length, calls, 'a workspace with no connection never reaches Google');
    assert.ok([403, 404].includes((await t.call('zed', 'POST', `${ws()}/refresh`)).status), 'not a member of this workspace');
    assert.ok([403, 404].includes((await t.call('zed', 'POST', `${ws()}/${conn.id}/sync`)).status));
    assert.equal(JSON.stringify((await t.call('ora', 'GET', ws())).body).includes('accessToken'), false, 'tokens never leave the server');
  });
});
