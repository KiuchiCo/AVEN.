import type { CapacitorConfig } from '@capacitor/cli';

/**
 * AVEN. for iPhone and iPad: a native shell around the deployed web app (it holds no workspace data of its own).
 * Build for your server with AVEN_APP_URL=https://aven.example.com; without it the shell points at http://localhost:3000, which the
 * iOS Simulator reaches on this Mac.
 */
const origin = new URL(process.env.AVEN_APP_URL ?? 'http://localhost:3000').origin;
const local = ['localhost', '127.0.0.1'].includes(new URL(origin).hostname);
if (!origin.startsWith('https://') && !local) throw new Error('AVEN_APP_URL must be an https address (http only works for localhost).');

const config: CapacitorConfig = {
  appId: 'app.aven.mobile',
  appName: 'AVEN.',
  webDir: 'www',
  // Only the app's own address and Clerk's hosted sign-in pages open inside the app; every other link opens in Safari. The server address
  // is the bare origin: Capacitor treats an address as "inside the app" only when it starts with it, and signing in leaves /workspace.
  server: { url: origin, allowNavigation: [new URL(origin).hostname, '*.clerk.accounts.dev', '*.clerk.com'], cleartext: local },
  ios: { contentInset: 'always', backgroundColor: '#F8F6F1', scheme: 'AVEN' },
};

export default config;
