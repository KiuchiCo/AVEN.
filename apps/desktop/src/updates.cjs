'use strict';

/**
 * Updates for the desktop app. They stay switched off unless the build or the person's environment names where updates are published (AVEN_UPDATE_URL, an https address),
 * and they only run in an installed, packaged app. Nothing is downloaded without the person agreeing, and what is downloaded is checked by the operating system's own
 * code-signature rules before it is installed: on macOS an update must be signed by the same Developer ID as the running app, and on Windows by the publisher named in
 * the build (win.publisherName). An unsigned or differently signed update is refused and the app keeps running as it is.
 */

/** The address updates come from, or null when updates are off. Only https, and never a local or private address. */
function updateFeed(env, packaged) {
  const raw = (env.AVEN_UPDATE_URL ?? '').trim();
  if (!raw || !packaged || env.AVEN_UPDATES_DISABLED === '1') return null;
  let url; try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1)/i.test(url.hostname) || url.hostname.endsWith('.local')) return null;
  return url.href.replace(/\/$/, '');
}

/** Wires the updater into the app. `autoUpdater` and `dialog` are passed in so this can be tested without Electron. */
function startUpdates({ feed, autoUpdater, dialog, getWindow, log = () => undefined, intervalMs = 6 * 60 * 60 * 1000 }) {
  if (!feed || !autoUpdater) return { enabled: false };
  autoUpdater.autoDownload = false;            // ask first
  autoUpdater.autoInstallOnAppQuit = false;    // install only when the person chooses to restart
  autoUpdater.allowDowngrade = false;          // never go back to an older version
  autoUpdater.allowPrerelease = false;
  autoUpdater.setFeedURL({ provider: 'generic', url: feed });
  let busy = false;
  const say = (options) => dialog.showMessageBox(getWindow() ?? undefined, { noLink: true, ...options });
  autoUpdater.on('update-available', async (info) => {
    const choice = await say({ type: 'info', message: `AVEN. ${info.version} is available`, detail: 'Download it now? Your work stays as it is. You choose when to restart.', buttons: ['Download', 'Later'], defaultId: 0, cancelId: 1 });
    if (choice.response === 0) { busy = true; autoUpdater.downloadUpdate().catch((error) => { busy = false; log(`update download failed: ${error?.message ?? error}`); }); }
  });
  autoUpdater.on('update-downloaded', async (info) => {
    busy = false;
    const choice = await say({ type: 'info', message: `AVEN. ${info.version} is ready`, detail: 'Restart to finish installing it. If you wait, it is installed the next time you choose Restart.', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1 });
    if (choice.response === 0) autoUpdater.quitAndInstall();
  });
  // A download that is interrupted, fails its signature check or cannot be installed leaves the running version untouched; it is tried again at the next check.
  autoUpdater.on('error', (error) => { busy = false; log(`update check failed: ${error?.message ?? error}`); });
  const check = () => { if (!busy) autoUpdater.checkForUpdates().catch((error) => log(`update check failed: ${error?.message ?? error}`)); };
  setTimeout(check, 30_000).unref?.();
  const timer = setInterval(check, intervalMs); timer.unref?.();
  return { enabled: true, check };
}

module.exports = { updateFeed, startUpdates };
