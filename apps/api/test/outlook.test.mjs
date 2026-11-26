import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MicrosoftCalendar, ProviderError } from '../dist/calendar-sync/providers.js';

// Microsoft Graph logic against a fake fetch. No Microsoft account is involved: this checks AVEN's side of the protocol only.
const config = { clientId: 'cid', clientSecret: 'csecret', authUrl: 'https://login.test/authorize', tokenUrl: 'https://login.test/token', apiBase: 'https://graph.test/v1.0' };
const provider = new MicrosoftCalendar(config);
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
async function withFetch(handler, run) { const original = globalThis.fetch; const calls = []; globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return handler(String(url), init, calls); }; try { return await run(calls); } finally { globalThis.fetch = original; } }
const content = { title: 'Standup', description: 'Daily', location: 'Room 1', isAllDay: false, startsAt: new Date('2027-03-01T09:00:00Z'), endsAt: new Date('2027-03-01T09:30:00Z') };

test('the sign-in address asks for the calendar permission, carries the state, and sends no secret', () => {
  const url = new URL(provider.authUrl('STATE', 'https://api.test/cb'));
  assert.equal(url.origin + url.pathname, 'https://login.test/authorize');
  assert.equal(url.searchParams.get('state'), 'STATE'); assert.match(url.searchParams.get('scope'), /Calendars\.ReadWrite/); assert.match(url.searchParams.get('scope'), /offline_access/);
  assert.equal(url.searchParams.get('redirect_uri'), 'https://api.test/cb'); assert.equal(url.toString().includes('csecret'), false);
});

test('connecting exchanges the code, learns the account, and refuses a grant without the calendar permission', async () => {
  const ok = (scope) => (url) => url.startsWith(config.tokenUrl) ? json(200, { access_token: 'A', refresh_token: 'R', expires_in: 3600, scope }) : json(200, { mail: 'Me@Outlook.test' });
  const got = await withFetch(ok('Calendars.ReadWrite User.Read'), () => provider.exchange('code', 'https://api.test/cb'));
  assert.deepEqual([got.email, got.accessToken, got.refreshToken], ['me@outlook.test', 'A', 'R']); assert.match(got.scopes, /Calendars\.ReadWrite/);
  await assert.rejects(withFetch(ok('User.Read'), () => provider.exchange('code', 'https://api.test/cb')), (e) => e instanceof ProviderError && /calendar permission/.test(e.message));
  await assert.rejects(withFetch((url) => url.startsWith(config.tokenUrl) ? json(200, { access_token: 'A' }) : json(200, {}), () => provider.exchange('c', 'r')), /did not return the tokens/);
});

test('a refused refresh asks the person to reconnect; a busy service is retried later', async () => {
  await assert.rejects(withFetch(() => json(400, { error: 'invalid_grant', error_description: 'AADSTS70000 expired' }), () => provider.refresh('R')), (e) => e.kind === 'auth');
  await assert.rejects(withFetch(() => json(503, {}), () => provider.refresh('R')), (e) => e.kind === 'retry');
  const kept = await withFetch(() => json(200, { access_token: 'A2', expires_in: 60 }), () => provider.refresh('R-old'));
  assert.equal(kept.refreshToken, 'R-old', 'a refresh that returns no new refresh token keeps the old one');
});

test('events are read as plain text with full descriptions, cancellations flagged, and only the provider’s own next page is followed', async () => {
  const page1 = { value: [{ id: 'e1', subject: 'Plan', body: { content: 'x'.repeat(400) }, bodyPreview: 'x'.repeat(255), location: { displayName: 'HQ' }, start: { dateTime: '2027-03-01T09:00:00.0000000' }, end: { dateTime: '2027-03-01T10:00:00.0000000' }, isAllDay: false, lastModifiedDateTime: '2027-02-01T00:00:00Z', '@odata.etag': 'W/"1"' }, { id: 'e2', subject: 'Gone', isCancelled: true, start: { dateTime: '2027-03-02T09:00:00' }, end: { dateTime: '2027-03-02T10:00:00' } }], '@odata.nextLink': 'https://evil.test/steal?x=1' };
  const events = await withFetch(() => json(200, page1), async (calls) => { const list = await provider.list('TOKEN', { from: new Date(0), to: new Date(1e12) }); assert.equal(calls.length, 1, 'a next link on another host is not followed (the token would go with it)'); assert.match(calls[0].init.headers.Prefer, /body-content-type="text"/); assert.match(decodeURIComponent(calls[0].url), /\$select=[^&]*,body,/); return list; });
  assert.equal(events[0].description.length, 400); assert.equal(events[0].startsAt.toISOString(), '2027-03-01T09:00:00.000Z'); assert.equal(events[0].location, 'HQ');
  assert.deepEqual(events.map((e) => e.cancelled), [false, true]);
});

test('sending: the same key carries the same transactionId (a retry cannot make a second event), different keys differ, all-day and timed events are shaped for Graph', async () => {
  const sent = await withFetch(() => json(201, { id: 'new', '@odata.etag': 'W/"9"' }), async (calls) => {
    const a = await provider.create('T', content, 'conn:evt1'); await provider.create('T', content, 'conn:evt1'); await provider.create('T', content, 'conn:evt2'); await provider.create('T', content);
    assert.deepEqual([a.id, a.etag], ['new', 'W/"9"']);
    return calls.map((c) => JSON.parse(c.init.body));
  });
  assert.equal(sent[0].transactionId, sent[1].transactionId); assert.notEqual(sent[0].transactionId, sent[2].transactionId); assert.equal('transactionId' in sent[3], false);
  assert.deepEqual([sent[0].subject, sent[0].isAllDay, sent[0].start.dateTime, sent[0].end.dateTime, sent[0].start.timeZone], ['Standup', false, '2027-03-01T09:00:00.000', '2027-03-01T09:30:00.000', 'UTC']);
  const day = await withFetch(() => json(201, { id: 'd' }), async (calls) => { await provider.create('T', { ...content, isAllDay: true, startsAt: new Date('2027-03-05T12:00:00Z'), endsAt: null }); return JSON.parse(calls[0].init.body); });
  assert.deepEqual([day.isAllDay, day.start.dateTime, day.end.dateTime], [true, '2027-03-05T00:00:00', '2027-03-06T00:00:00']);
});

test('editing is conditional on the version we saw; a changed event is a conflict; deleting a missing event is fine; only the named event is addressed', async () => {
  await withFetch(() => json(200, { '@odata.etag': 'W/"2"' }), async (calls) => { const r = await provider.update('T', 'id/with?odd#chars', content, 'W/"1"'); assert.equal(r.etag, 'W/"2"'); assert.equal(calls[0].init.method, 'PATCH'); assert.equal(calls[0].init.headers['If-Match'], 'W/"1"'); assert.ok(calls[0].url.endsWith('/me/events/id%2Fwith%3Fodd%23chars')); });
  await assert.rejects(withFetch(() => json(412, {}), () => provider.update('T', 'e', content, 'W/"old"')), (e) => e.kind === 'conflict');
  await withFetch(() => new Response(null, { status: 404 }), () => provider.remove('T', 'gone'));
  await assert.rejects(withFetch(() => json(403, { error: { message: 'Access is denied. Forbidden' } }), () => provider.remove('T', 'e')), (e) => e.kind === 'auth');
});
