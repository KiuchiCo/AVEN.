import type { NextConfig } from 'next';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootEnvPath = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

const production = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  // The browser tests use their own folder so they can run while a normal dev server is open.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  // The browser tests open the dev server by IP address; without this Next blocks its client scripts from that address.
  allowedDevOrigins: ['127.0.0.1'],
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        // The directives that never break a page: nothing can embed AVEN in another site, change the base address, post forms elsewhere or load plugins.
        // shortcut: no script-src yet, because Clerk and Next need per-request nonces to run under one; add it with a nonce middleware.
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
        ...(production ? [{ key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' }] : []),
      ],
    }];
  },
};

export default nextConfig;
