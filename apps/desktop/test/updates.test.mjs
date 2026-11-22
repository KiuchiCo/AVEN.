import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createRequire } from 'node:module';
const { updateFeed, startUpdates } = createRequire(import.meta.url)('../src/updates.cjs');

test('updates are off unless an https, public address is configured for an installed app', () => {
  assert.equal(updateFeed({}, true), null); assert.equal(updateFeed({ AVEN_UPDATE_URL: 'https://updates.example.com/aven/' }, false), null, 'not when running from source');
  assert.equal(updateFeed({ AVEN_UPDATE_URL: 'https://updates.example.com/aven/' }, true), 'https://updates.example.com/aven');
  for (const bad of ['http://updates.example.com', 'https://localhost/x', 'https://127.0.0.1/x', 'https://192.168.1.5/x', 'https://user:pw@updates.example.com', 'ftp://x.example.com', 'nonsense', 'https://printer.local/x']) assert.equal(updateFeed({ AVEN_UPDATE_URL: bad }, true), null, bad);
  assert.equal(updateFeed({ AVEN_UPDATE_URL: 'https://updates.example.com', AVEN_UPDATES_DISABLED: '1' }, true), null, 'and it can be switched off');
});

function fakeUpdater() { const u = new EventEmitter(); Object.assign(u, { calls: [], setFeedURL(x) { this.calls.push(['feed', x]); }, downloadUpdate: async () => { u.calls.push(['download']); }, quitAndInstall: () => { u.calls.push(['install']); }, checkForUpdates: async () => { u.calls.push(['check']); } }); return u; }

test('an update is only downloaded when the person agrees, only installed when they choose to restart, and never goes backwards', async () => {
  const updater = fakeUpdater(); const answers = [{ response: 0 }, { response: 1 }]; const asked = [];
  const dialog = { showMessageBox: async (_w, options) => { asked.push(options.message); return answers.shift(); } };
  const result = startUpdates({ feed: 'https://updates.example.com/aven', autoUpdater: updater, dialog, getWindow: () => null, intervalMs: 1e9 });
  assert.equal(result.enabled, true); assert.equal(updater.autoDownload, false); assert.equal(updater.autoInstallOnAppQuit, false); assert.equal(updater.allowDowngrade, false);
  assert.deepEqual(updater.calls[0], ['feed', { provider: 'generic', url: 'https://updates.example.com/aven' }]);
  updater.emit('update-available', { version: '1.2.0' }); await new Promise((r) => setImmediate(r));
  assert.ok(updater.calls.some((c) => c[0] === 'download'), 'downloaded after "Download"');
  updater.emit('update-downloaded', { version: '1.2.0' }); await new Promise((r) => setImmediate(r));
  assert.ok(!updater.calls.some((c) => c[0] === 'install'), 'not installed after "Later"'); assert.equal(asked.length, 2);
});

test('a failed or interrupted update is logged and leaves the running app alone; with no feed nothing is set up', async () => {
  const updater = fakeUpdater(); const log = []; startUpdates({ feed: 'https://updates.example.com/aven', autoUpdater: updater, dialog: { showMessageBox: async () => ({ response: 1 }) }, getWindow: () => null, log: (m) => log.push(m), intervalMs: 1e9 });
  updater.emit('error', new Error('signature mismatch')); assert.match(log[0], /signature mismatch/); assert.ok(!updater.calls.some((c) => c[0] === 'install'));
  assert.deepEqual(startUpdates({ feed: null, autoUpdater: updater }), { enabled: false });
});
