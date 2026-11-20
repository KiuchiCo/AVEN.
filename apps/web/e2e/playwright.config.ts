import { defineConfig } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT ?? '4100';
const webPort = process.env.E2E_WEB_PORT ?? '3100';
const origin = `http://127.0.0.1:${webPort}`;
const apiBase = `http://127.0.0.1:${apiPort}/api/v1`;

/** Drives the real Google Chrome on this machine against a fresh API and web server. Started by `npm run test:e2e`. */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: origin, channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  outputDir: './test-results',
  webServer: [
    {
      command: 'node dist/main.js', cwd: '../../api', url: `${apiBase}/health`, timeout: 60_000, reuseExistingServer: false,
      env: { NODE_ENV: 'development', API_PORT: apiPort, WEB_ORIGIN: origin, DATABASE_URL: process.env.E2E_DATABASE_URL ?? '', WORKFLOWS_DISABLED: 'true', EMAIL_DISABLED: 'true', PUSH_DISABLED: 'true' },
    },
    {
      command: `npx next dev -p ${webPort}`, cwd: '..', url: origin, timeout: 180_000, reuseExistingServer: false,
      env: { NEXT_PUBLIC_API_BASE_URL: apiBase, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.E2E_CLERK_PUBLISHABLE_KEY ?? '', CLERK_SECRET_KEY: process.env.E2E_CLERK_SECRET_KEY ?? '', NEXT_TELEMETRY_DISABLED: '1', NEXT_DIST_DIR: '.next-e2e' },
    },
  ],
});
