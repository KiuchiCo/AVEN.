import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { timeZoneCookieValue, timeZoneScript } from '../app/time-zone-script.ts';

const noon = new Date('2026-01-15T12:00:00Z');
const run = (cookie) => { const sandbox = { document: { cookie }, Intl: { DateTimeFormat: Intl.DateTimeFormat }, Date, Object }; runInNewContext(timeZoneScript, sandbox); return sandbox; };
const hour = (zone) => Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hour12: false }).format(noon));

test('with no cookie nothing is changed', () => {
  const { Intl: patched } = run('a=1'); assert.equal(patched.DateTimeFormat, Intl.DateTimeFormat);
});
test('a chosen zone becomes the default for Intl and Date formatting, but an explicit zone still wins', () => {
  const sandbox = run('x=1; aven-tz=Pacific%2FAuckland');
  const { DateTimeFormat } = sandbox.Intl;
  assert.equal(Number(new DateTimeFormat('en-US', { hour: 'numeric', hour12: false }).format(noon)), hour('Pacific/Auckland'));
  assert.equal(new DateTimeFormat().resolvedOptions().timeZone, 'Pacific/Auckland');
  assert.equal(new DateTimeFormat('en-US', { timeZone: 'UTC', hour: 'numeric', hour12: false }).resolvedOptions().timeZone, 'UTC');
  assert.match(DateTimeFormat('en-US').resolvedOptions().timeZone, /Auckland/, 'works when called without new');
  assert.equal(Number(noon.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false })), hour('Pacific/Auckland'));
});
test('an invalid zone in the cookie is ignored', () => {
  const sandbox = run('aven-tz=Not%2FAZone'); assert.equal(sandbox.Intl.DateTimeFormat, Intl.DateTimeFormat);
});
test('cookie text sets and clears the zone', () => {
  assert.match(timeZoneCookieValue('Australia/Sydney'), /^aven-tz=Australia%2FSydney; path=\/; max-age=31536000/);
  assert.match(timeZoneCookieValue(null), /max-age=0/);
});

test('the real device zone stays available after the preference is applied', () => {
  const sandbox = run('aven-tz=Pacific%2FAuckland');
  assert.equal(sandbox.Intl.DateTimeFormat.deviceZone, new Intl.DateTimeFormat().resolvedOptions().timeZone);
});
