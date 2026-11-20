'use strict';
/** Decisions the desktop shell makes about addresses and permissions. No Electron here, so they can be tested on their own. */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Sign-in pages that may load inside the app window (Clerk's hosted pages). Add more with AVEN_ALLOWED_HOSTS (comma separated, `*.example.com` allowed). */
const DEFAULT_SIGN_IN_HOSTS = ['*.clerk.accounts.dev', '*.clerk.com'];

/** The server address as an origin, or null when it isn't one the app may talk to (https, or http only for this computer). */
function parseServerUrl(input) {
  if (typeof input !== 'string') return null;
  let url;
  try { url = new URL(input.trim()); } catch { return null; }
  const okProtocol = url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname));
  return okProtocol && !url.username && !url.password ? url.origin : null;
}

/** Where to load AVEN. from: the environment first, then what the person saved, then what the build was made for, then localhost while developing. */
function resolveServerUrl({ env = {}, saved = null, bundled = null, packaged = false }) {
  for (const candidate of [env.AVEN_URL, saved, bundled]) { const origin = parseServerUrl(candidate); if (origin) return origin; }
  return packaged ? null : 'http://localhost:3000';
}

const hostMatches = (host, pattern) => (pattern.startsWith('*.') ? host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1 : host === pattern);

/**
 * What to do with an address the window is about to open:
 * 'app' (the server itself), 'auth' (a sign-in page that may load in the window), 'external' (a web or mail link: hand it to the browser), or 'blocked'.
 */
function classifyUrl(target, { appOrigin, extraHosts = [] }) {
  let url;
  try { url = new URL(target); } catch { return 'blocked'; }
  if (url.protocol === 'mailto:') return 'external';
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'blocked';
  if (url.origin === appOrigin) return 'app';
  if (url.protocol === 'https:' && [...DEFAULT_SIGN_IN_HOSTS, ...extraHosts].some((pattern) => hostMatches(url.hostname, pattern))) return 'auth';
  return 'external';
}

/** Browser permissions the app may use. Everything else (camera, microphone, location, ...) is refused. */
const ALLOWED_PERMISSIONS = new Set(['notifications', 'clipboard-sanitized-write', 'fullscreen']);
function permissionAllowed(permission, requestingUrl, appOrigin) {
  try { return ALLOWED_PERMISSIONS.has(permission) && new URL(requestingUrl).origin === appOrigin; } catch { return false; }
}

/** A saved window position, but only if it still falls on a screen that exists. */
function usableBounds(saved, displays) {
  if (!saved || ![saved.x, saved.y, saved.width, saved.height].every(Number.isFinite) || saved.width < 600 || saved.height < 400) return null;
  const visible = displays.some((area) => saved.x < area.x + area.width - 80 && saved.x + saved.width > area.x + 80 && saved.y < area.y + area.height - 80 && saved.y + saved.height > area.y + 40);
  return visible ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height } : null;
}

module.exports = { parseServerUrl, resolveServerUrl, classifyUrl, permissionAllowed, usableBounds, DEFAULT_SIGN_IN_HOSTS };
