import assert from 'node:assert/strict';
import test from 'node:test';
import { MicrosoftCalendar } from '../dist/calendar-sync/providers.js';

test('security: the access token is never sent to a "next page" link on another address', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), auth: init?.headers?.Authorization ?? init?.headers?.authorization }); return new Response(JSON.stringify({ value: [], '@odata.nextLink': calls.length === 1 ? 'https://attacker.example/steal' : 'https://graph.test/v1.0/next' }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  try {
    const provider = new MicrosoftCalendar({ clientId: 'c', clientSecret: 's', authUrl: 'https://login.test/a', tokenUrl: 'https://login.test/t', apiBase: 'https://graph.test/v1.0' });
    await provider.list('TOKEN', { from: new Date(0), to: new Date(1e12) });
  } finally { globalThis.fetch = original; }
  assert.equal(calls.length, 1, 'the foreign link was not followed');
  assert.ok(!calls.some((call) => call.url.includes('attacker.example')));
});

test('a next page on the provider’s own address is still followed', async () => {
  const calls = []; const original = globalThis.fetch;
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response(JSON.stringify({ value: [], ...(calls.length === 1 ? { '@odata.nextLink': 'https://graph.test/v1.0/next?page=2' } : {}) }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  try { await new MicrosoftCalendar({ clientId: 'c', clientSecret: 's', authUrl: 'https://login.test/a', tokenUrl: 'https://login.test/t', apiBase: 'https://graph.test/v1.0' }).list('T', { from: new Date(0), to: new Date(1e12) }); } finally { globalThis.fetch = original; }
  assert.deepEqual(calls.map((url) => new URL(url).pathname), ['/v1.0/me/calendarView', '/v1.0/next']);
});

test('Google: insufficient scopes at sync time give a clear reconnect message, and a token without the calendar permission is refused on refresh', async () => {
  const { GoogleCalendar, ProviderError, googleScopesAllowEvents, GOOGLE_SCOPES } = await import('../dist/calendar-sync/providers.js');
  assert.equal(GOOGLE_SCOPES, 'openid email https://www.googleapis.com/auth/calendar.events');
  assert.equal(googleScopesAllowEvents('openid email https://www.googleapis.com/auth/calendar.events'), true);
  assert.equal(googleScopesAllowEvents('https://www.googleapis.com/auth/calendar'), true);
  for (const bad of ['openid email', 'https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly', undefined, '']) assert.equal(googleScopesAllowEvents(bad), false, String(bad));
  const real = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => String(url).includes('/events')
      ? new Response(JSON.stringify({ error: { code: 403, message: 'Request had insufficient authentication scopes.', status: 'PERMISSION_DENIED' } }), { status: 403 })
      : new Response(JSON.stringify({ access_token: 'a', expires_in: 3600, scope: 'openid email' }), { status: 200 });
    const google = new GoogleCalendar({ clientId: 'c', clientSecret: 's', authUrl: 'https://x/auth', tokenUrl: 'https://x/token', apiBase: 'https://www.googleapis.com/calendar/v3' });
    await assert.rejects(google.list('tok', { from: new Date(), to: new Date() }), (e) => e instanceof ProviderError && e.kind === 'auth' && /connect again/.test(e.message) && !/tok/.test(e.message));
    await assert.rejects(google.refresh('r'), (e) => e instanceof ProviderError && e.kind === 'auth' && /calendar permission/.test(e.message));
  } finally { globalThis.fetch = real; }
});
