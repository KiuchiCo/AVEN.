import assert from 'node:assert/strict';
import { test } from 'node:test';

/** The shell's config reads AVEN_APP_URL when it is loaded, so each case loads a fresh copy with its own value. */
async function load(value) {
  const before = process.env.AVEN_APP_URL;
  if (value === undefined) delete process.env.AVEN_APP_URL; else process.env.AVEN_APP_URL = value;
  try { return (await import(`../capacitor.config.ts?case=${Math.random()}`)).default; } finally { if (before === undefined) delete process.env.AVEN_APP_URL; else process.env.AVEN_APP_URL = before; }
}

test('without a server address the shell points at localhost, which the simulator reaches on this Mac', async () => {
  const config = await load(undefined);
  assert.equal(config.server.url, 'http://localhost:3000'); assert.equal(config.server.cleartext, true);
});

test('a deployed server is used as a bare https origin, and plain http is not allowed for it', async () => {
  const config = await load('https://aven.example.com/workspace/tasks?x=1');
  assert.equal(config.server.url, 'https://aven.example.com', 'a bare origin, so sign-in pages on the same site stay inside the app');
  assert.equal(config.server.cleartext, false);
  assert.ok(config.server.allowNavigation.includes('aven.example.com') && config.server.allowNavigation.includes('*.clerk.accounts.dev'));
  await assert.rejects(load('http://aven.example.com'), /https/);
  await assert.rejects(load('not a url'));
});

test('the shell identifies itself as AVEN. and uses the brand background', async () => {
  const config = await load('https://aven.example.com');
  assert.equal(config.appName, 'AVEN.'); assert.equal(config.ios.backgroundColor, '#F8F6F1');
});
