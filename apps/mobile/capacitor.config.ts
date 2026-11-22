import type { CapacitorConfig } from '@capacitor/cli';

/**
 * AVEN. for iPhone and iPad: a native app (Capacitor) around the web app of ONE environment, with AVEN.'s own native layer on top (see ios/App/App/AvenNativePlugin.swift).
 * It holds no workspace data of its own and never talks to a development computer at runtime unless it was built for development.
 *
 *   AVEN_ENV=development  (default)  http://localhost:3000, or AVEN_APP_URL (a LAN address such as http://192.168.1.20:3000 for a real device)
 *   AVEN_ENV=staging                 AVEN_APP_URL or AVEN_STAGING_URL, https only
 *   AVEN_ENV=production              AVEN_APP_URL or AVEN_PRODUCTION_URL, https only, never a local or private address
 */
export type Environment = 'development' | 'staging' | 'production';

const privateHost = (host: string) => /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1)/i.test(host) || host.endsWith('.local');

/** Works out the address this build loads, and refuses unsafe combinations. Exported for tests. */
export function resolveServer(env: Record<string, string | undefined>): { environment: Environment; origin: string; cleartext: boolean } {
  const environment = (env.AVEN_ENV ?? 'development') as Environment;
  if (!['development', 'staging', 'production'].includes(environment)) throw new Error('AVEN_ENV must be development, staging or production.');
  const raw = environment === 'development' ? env.AVEN_APP_URL ?? 'http://localhost:3000' : env.AVEN_APP_URL ?? (environment === 'staging' ? env.AVEN_STAGING_URL : env.AVEN_PRODUCTION_URL);
  if (!raw) throw new Error(`A ${environment} build needs the web app's address: set AVEN_APP_URL (or AVEN_${environment.toUpperCase()}_URL).`);
  const origin = new URL(raw).origin;
  const host = new URL(origin).hostname;
  if (environment !== 'development' && (!origin.startsWith('https://') || privateHost(host))) throw new Error(`A ${environment} build must load a public https address, not ${origin}.`);
  if (!origin.startsWith('https://') && !privateHost(host)) throw new Error('AVEN_APP_URL must be an https address (http only works for this computer or your local network).');
  return { environment, origin, cleartext: !origin.startsWith('https://') };
}

const { environment, origin, cleartext } = resolveServer(process.env);

const config: CapacitorConfig = {
  appId: 'app.aven.mobile',
  appName: 'AVEN.',
  webDir: 'www',
  // Only the app's own address and Clerk's hosted sign-in pages open inside the app; every other link opens in Safari. The server address
  // is the bare origin: Capacitor treats an address as "inside the app" only when it starts with it, and signing in leaves /workspace.
  server: { url: origin, allowNavigation: [new URL(origin).hostname, '*.clerk.accounts.dev', '*.clerk.com', '*.clerk.services'], cleartext, errorPath: 'offline.html' },
  ios: { contentInset: 'always', backgroundColor: '#F8F6F1', scheme: 'AVEN', limitsNavigationsToAppBoundDomains: false },
  // Visible to the native layer (and the web app) so each knows which environment it is in.
  plugins: { AvenNative: { environment } },
};

export default config;
