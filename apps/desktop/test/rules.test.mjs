import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const { parseServerUrl, resolveServerUrl, classifyUrl, permissionAllowed, usableBounds } = createRequire(import.meta.url)('../src/rules.cjs');

test('only https servers, or http on this computer, are accepted, as bare origins', () => {
  assert.equal(parseServerUrl('https://app.example.com/workspace?x=1'), 'https://app.example.com');
  assert.equal(parseServerUrl(' http://localhost:3000/ '), 'http://localhost:3000');
  assert.equal(parseServerUrl('http://127.0.0.1:3100'), 'http://127.0.0.1:3100');
  for (const bad of ['http://example.com', 'ftp://example.com', 'javascript:alert(1)', 'file:///etc/passwd', 'https://user:pw@example.com', 'not a url', '', null, 42]) assert.equal(parseServerUrl(bad), null, String(bad));
});

test('the server comes from the environment, then the saved choice, then the build, then localhost only while developing', () => {
  assert.equal(resolveServerUrl({ env: { AVEN_URL: 'https://a.example' }, saved: 'https://b.example', bundled: 'https://c.example', packaged: true }), 'https://a.example');
  assert.equal(resolveServerUrl({ saved: 'https://b.example', bundled: 'https://c.example', packaged: true }), 'https://b.example');
  assert.equal(resolveServerUrl({ saved: 'http://evil.example', bundled: 'https://c.example', packaged: true }), 'https://c.example', 'an unusable saved value is skipped');
  assert.equal(resolveServerUrl({ packaged: false }), 'http://localhost:3000');
  assert.equal(resolveServerUrl({ packaged: true }), null, 'a packaged app with no server asks the person for one');
});

test('links are kept in the app, allowed to sign in, sent to the browser, or blocked', () => {
  const options = { appOrigin: 'https://app.example.com' };
  assert.equal(classifyUrl('https://app.example.com/workspace/tasks', options), 'app');
  assert.equal(classifyUrl('https://clean-owl-12.clerk.accounts.dev/v1/client', options), 'auth');
  assert.equal(classifyUrl('http://clean-owl-12.clerk.accounts.dev/', options), 'external', 'sign-in pages must be https');
  assert.equal(classifyUrl('https://evilclerk.com/', options), 'external');
  assert.equal(classifyUrl('https://clerk.com.evil.example/', options), 'external');
  assert.equal(classifyUrl('https://news.example.org/story', options), 'external');
  assert.equal(classifyUrl('mailto:someone@example.com', options), 'external');
  for (const blocked of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'chrome://gpu', 'nonsense']) assert.equal(classifyUrl(blocked, options), 'blocked', blocked);
  assert.equal(classifyUrl('https://login.corp.example/saml', { ...options, extraHosts: ['login.corp.example'] }), 'auth');
  assert.equal(classifyUrl('https://sso.corp.example/', { ...options, extraHosts: ['*.corp.example'] }), 'auth');
  assert.equal(classifyUrl('https://corp.example/', { ...options, extraHosts: ['*.corp.example'] }), 'external', 'the bare domain is not matched by *.');
});

test('only a few permissions are granted, and only to the app itself', () => {
  const app = 'https://app.example.com';
  assert.equal(permissionAllowed('notifications', `${app}/x`, app), true);
  assert.equal(permissionAllowed('clipboard-sanitized-write', `${app}/`, app), true);
  for (const refused of ['media', 'geolocation', 'camera', 'microphone', 'midi', 'openExternal', 'clipboard-read']) assert.equal(permissionAllowed(refused, app, app), false, refused);
  assert.equal(permissionAllowed('notifications', 'https://other.example/', app), false);
  assert.equal(permissionAllowed('notifications', 'nonsense', app), false);
});

test('a saved window position is used only if it is still on a screen', () => {
  const screens = [{ x: 0, y: 0, width: 1440, height: 900 }];
  assert.deepEqual(usableBounds({ x: 100, y: 80, width: 1200, height: 800 }, screens), { x: 100, y: 80, width: 1200, height: 800 });
  assert.equal(usableBounds({ x: 3000, y: 80, width: 1200, height: 800 }, screens), null, 'it was on a monitor that is gone');
  assert.equal(usableBounds({ x: 0, y: 0, width: 100, height: 100 }, screens), null, 'too small to use');
  assert.equal(usableBounds({ x: 'a', y: 0, width: 900, height: 700 }, screens), null);
  assert.equal(usableBounds(null, screens), null);
});
