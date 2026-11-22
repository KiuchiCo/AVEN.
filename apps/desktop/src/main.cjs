'use strict';
const { app, BrowserWindow, Menu, shell, session, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { updateFeed, startUpdates } = require('./updates.cjs');
const { parseServerUrl, resolveServerUrl, classifyUrl, permissionAllowed, usableBounds } = require('./rules.cjs');

/**
 * AVEN. for desktop: the web app in a native window. The window runs the site like a browser tab would (no Node access, sandboxed,
 * isolated), keeps its own sign-in, and hands every link to somewhere else to the system browser. It holds no workspace data itself.
 * Set AVEN_DESKTOP_SMOKE=1 to load the app once, print what was found, and exit (used by `npm run smoke`).
 */
const smoke = process.env.AVEN_DESKTOP_SMOKE === '1';
if (smoke) app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'aven-desktop-smoke-')));

const extraHosts = (process.env.AVEN_ALLOWED_HOSTS || '').split(',').map((host) => host.trim()).filter(Boolean);
const ownPages = pathToFileURL(__dirname).href;
let window = null;
let appOrigin = null;
let saveTimer = null;

const userFile = (name) => path.join(app.getPath('userData'), name);
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const writeJson = (file, value) => { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); } catch { /* losing a preference is not worth stopping for */ } };
const bundledUrl = () => readJson(app.isPackaged ? path.join(process.resourcesPath, 'config', 'app.json') : path.join(__dirname, '..', 'config', 'app.json'))?.appUrl ?? null;
const serverUrl = () => resolveServerUrl({ env: process.env, saved: readJson(userFile('config.json'))?.appUrl, bundled: bundledUrl(), packaged: app.isPackaged });

/** Only the shell's own pages may ask it to do things. */
const fromOwnPage = (event) => String(event.senderFrame?.url ?? '').startsWith(ownPages);

function openOutside(url) {
  if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url);
}

/** Applies the link rules to somewhere the window is trying to go. Returns true when the window may go there. */
function allowNavigation(url) {
  if (url.startsWith(ownPages)) return true;
  const kind = classifyUrl(url, { appOrigin: appOrigin ?? '', extraHosts });
  if (kind === 'app' || kind === 'auth') return true;
  if (kind === 'external') openOutside(url);
  return false;
}

function showSetup() { if (window) void window.loadFile(path.join(__dirname, 'setup.html')); }

function loadApp() {
  if (smoke && process.env.AVEN_DESKTOP_SHOW === 'setup') { showSetup(); return; } // for looking at the shell's own page
  const url = serverUrl();
  if (!url) { showSetup(); return; }
  appOrigin = new URL(url).origin;
  void window.loadURL(`${url}/workspace`);
}

function createWindow() {
  const saved = usableBounds(readJson(userFile('window-state.json')), screen.getAllDisplays().map((display) => display.workArea));
  window = new BrowserWindow({
    ...(saved ?? { width: 1360, height: 880 }), minWidth: 900, minHeight: 600, show: false, title: 'AVEN.', backgroundColor: '#F8F6F1',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: true },
  });
  if (!smoke) window.once('ready-to-show', () => window.show());
  const remember = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { if (window && !window.isDestroyed() && !window.isMinimized() && !window.isFullScreen()) writeJson(userFile('window-state.json'), window.getBounds()); }, 400); };
  window.on('resize', remember); window.on('move', remember);
  window.on('closed', () => { clearTimeout(saveTimer); window = null; });

  const contents = window.webContents;
  contents.setWindowOpenHandler(({ url }) => { if (allowNavigation(url)) void contents.loadURL(url); return { action: 'deny' }; });
  contents.on('will-navigate', (event, url) => { if (!allowNavigation(url)) event.preventDefault(); });
  contents.on('will-redirect', (event, url) => { if (!allowNavigation(url)) event.preventDefault(); });
  contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || url.startsWith(ownPages)) return; // -3: the page was replaced by another load
    void window.loadFile(path.join(__dirname, 'offline.html'), { query: { why: `${description}. Check your connection, then try again.` } });
  });
  contents.on('render-process-gone', () => { if (!smoke) loadApp(); });
  loadApp();
}

function buildMenu() {
  const mac = process.platform === 'darwin';
  const developing = !app.isPackaged;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ label: 'AVEN.', submenu: [{ role: 'about' }, { type: 'separator' }, { label: 'Change server…', click: showSetup }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'File', submenu: [{ label: 'Open AVEN. in browser', click: () => { if (appOrigin) openOutside(`${appOrigin}/workspace`); } }, ...(mac ? [] : [{ label: 'Change server…', click: showSetup }, { type: 'separator' }, { role: 'quit' }])] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, ...(developing ? [{ role: 'toggleDevTools' }] : []), { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ]));
}

app.on('web-contents-created', (_event, contents) => { contents.on('will-attach-webview', (event) => event.preventDefault()); });

ipcMain.on('aven:version', (event) => { event.returnValue = app.getVersion(); });
ipcMain.handle('aven:set-url', (event, input) => {
  if (!fromOwnPage(event)) return { error: 'Not allowed.' };
  const origin = parseServerUrl(input);
  if (!origin) return { error: 'Use an https address. (http only works for this computer.)' };
  writeJson(userFile('config.json'), { appUrl: origin });
  loadApp();
  return { ok: true };
});
ipcMain.handle('aven:retry', (event) => { if (fromOwnPage(event)) loadApp(); });
ipcMain.handle('aven:change-server', (event) => { if (fromOwnPage(event)) showSetup(); });

if (!smoke && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(() => {
    const allowed = (permission, url) => permissionAllowed(permission, url, appOrigin ?? '');
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(allowed(permission, details.requestingUrl || contents.getURL())));
    session.defaultSession.setPermissionCheckHandler((contents, permission, requestingOrigin) => allowed(permission, requestingOrigin));
    buildMenu();
    createWindow();
    if (smoke) runSmokeTest();
    else startUpdates({ feed: updateFeed(process.env, app.isPackaged), autoUpdater: app.isPackaged ? require('electron-updater').autoUpdater : null, dialog: require('electron').dialog, getWindow: () => window, log: (message) => console.warn(message) });
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

/** Loads the app once, reports what the page can and cannot see, and exits. Exit codes: 0 loaded, 1 failed to load, 2 timed out. */
function runSmokeTest() {
  const contents = window.webContents;
  const finish = (code, report) => { console.log(`AVEN_SMOKE ${JSON.stringify(report)}`); app.exit(code); };
  setTimeout(() => finish(2, { error: 'timed out' }), 45_000).unref();
  contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => { if (isMainFrame && code !== -3 && !url.startsWith(ownPages)) finish(1, { error: description, url }); });
  contents.on('did-finish-load', async () => {
    const shot = process.env.AVEN_DESKTOP_SHOT; // optional: save a picture of the window to this path
    if (shot) { await new Promise((resolve) => setTimeout(resolve, 2500)); fs.writeFileSync(shot, (await contents.capturePage()).toPNG()); }
    if (contents.getURL().startsWith(ownPages)) { if (process.env.AVEN_DESKTOP_SHOW) finish(0, { page: contents.getURL().split('/').pop() }); return; }
    const facts = await contents.executeJavaScript('({ title: document.title, url: location.href, require: typeof require, process: typeof process, bridge: typeof window.avenDesktop, bridgeKeys: Object.keys(window.avenDesktop || {}), platform: window.avenDesktop && window.avenDesktop.platform })');
    finish(0, { ...facts, sandboxed: contents.getLastWebPreferences().sandbox, isolated: contents.getLastWebPreferences().contextIsolation, node: contents.getLastWebPreferences().nodeIntegration });
  });
}
