/**
 * The web app's view of the AVEN. iOS/iPadOS app. Inside the app (Capacitor) a native plugin called AvenNative is available; in a browser none of this does anything.
 * The native layer only adds device capabilities (haptics, biometrics, push, scanning, deep links). Who the person is, and what they may see, is still decided by Clerk and the API.
 */
type Listener = { remove: () => Promise<void> };
export type AvenNativePlugin = {
  haptic(options: { style: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error' }): Promise<void>;
  share(options: { title?: string; text?: string; url?: string }): Promise<{ completed: boolean }>;
  biometryStatus(): Promise<{ available: boolean; type: 'faceID' | 'touchID' | 'opticID' | 'passcode' | 'none'; lockEnabled: boolean }>;
  setAppLock(options: { enabled: boolean }): Promise<{ lockEnabled: boolean }>;
  scanDocument(): Promise<{ pages: string[]; mimeType: string }>;
  registerForPush(): Promise<{ granted: boolean }>;
  pushStatus(): Promise<{ permission: 'granted' | 'denied' | 'prompt'; token?: string; environment: 'development' | 'production' }>;
  consumePending(): Promise<{ links: string[] }>;
  wipeLocalData(): Promise<void>;
  addListener(event: 'deepLink' | 'pushAction' | 'pushToken', handler: (data: Record<string, string>) => void): Promise<Listener>;
};
type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: { AvenNative?: AvenNativePlugin } };

const capacitor = (): CapacitorGlobal | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor);

export const isNativeApp = () => Boolean(capacitor()?.isNativePlatform?.());
export const nativePlatform = () => capacitor()?.getPlatform?.() ?? 'web';
export const native = (): AvenNativePlugin | null => (isNativeApp() ? capacitor()?.Plugins?.AvenNative ?? null : null);

/** A restrained tap response for things that matter (choosing a tab, finishing a task). Never throws, and does nothing outside the app. */
export function haptic(style: Parameters<AvenNativePlugin['haptic']>[0]['style'] = 'selection') { void native()?.haptic({ style }).catch(() => undefined); }

/** iPad or iPhone, from the window the app has: used only to choose between layouts. */
export function deviceClass(width: number, touchPoints: number): 'ipad' | 'iphone' | 'other' {
  if (touchPoints < 2) return 'other';
  return width >= 700 ? 'ipad' : 'iphone';
}

const ROUTES = ['/workspace', '/workspace/inbox', '/workspace/tasks', '/workspace/calendar', '/workspace/projects', '/workspace/documents', '/workspace/databases', '/workspace/knowledge', '/workspace/whiteboards', '/workspace/messages', '/workspace/files', '/workspace/automations', '/workspace/intelligence', '/workspace/analytics', '/workspace/members', '/workspace/activity', '/workspace/search', '/workspace/settings', '/workspace/labels'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WITH_ID = ['/workspace/tasks', '/workspace/projects', '/workspace/documents', '/workspace/whiteboards'];

/**
 * Turns a link that opened the app (aven://…, a notification's path, or a link to this site) into a route inside the app, or null when it is not one of AVEN.'s own screens.
 * Only a fixed list of screens, optionally followed by an id, is ever opened: a link cannot point the app at another site, another scheme or an arbitrary path.
 * The screen itself still needs a signed-in person who may see it: an unauthenticated link lands on sign-in, and the API refuses anything the person may not read.
 */
export function routeForLink(link: string, appOrigin: string): string | null {
  let url: URL;
  try { url = new URL(link, appOrigin); } catch { return null; }
  let path: string;
  if (url.protocol === 'aven:') path = `/workspace${url.hostname && url.hostname !== 'open' && url.hostname !== 'workspace' ? `/${url.hostname}` : ''}${url.pathname === '/' ? '' : url.pathname}`.replace(/\/+/g, '/');
  else if ((url.protocol === 'https:' || url.protocol === 'http:') && url.origin === new URL(appOrigin).origin) path = url.pathname;
  else return null;
  path = path.replace(/\/+$/, '') || '/workspace';
  if ((ROUTES as readonly string[]).includes(path)) return path;
  const match = /^(\/workspace\/[a-z]+)\/([^/]+)$/.exec(path);
  if (match && WITH_ID.includes(match[1]) && UUID.test(match[2])) return path;
  return null;
}
