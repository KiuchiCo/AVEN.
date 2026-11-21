/** The host Clerk's scripts and API calls come from, read out of the publishable key (`pk_test_<base64 of host$>`). */
function clerkHost(key: string | undefined): string | null {
  try { const host = atob(key?.split('_')[2] ?? '').replace(/\$$/, ''); return /^[a-z0-9.-]+$/i.test(host) ? host : null; } catch { return null; }
}
const originOf = (value: string | undefined) => { try { return value ? new URL(value).origin : null; } catch { return null; } };

/**
 * One policy per request. Scripts run only if they carry this request's random nonce (or were started by one that does): a script injected into a page by an
 * attacker has no nonce and is refused, which is what makes cross-site scripting hard to exploit. There is no 'unsafe-inline' for scripts.
 * shortcut: styles are left unrestricted (no default-src or style-src), because React and the editor set style attributes that a strict style-src would break; scripts are the part that matters for XSS. Tighten with style nonces and hashes later.
 */
export function contentSecurityPolicy(nonce: string, dev = process.env.NODE_ENV !== 'production', env: Record<string, string | undefined> = process.env) {
  const clerk = clerkHost(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY); const api = originOf(env.NEXT_PUBLIC_API_BASE_URL);
  const list = (...values: (string | null | false)[]) => values.filter(Boolean).join(' ');
  return [
    `script-src ${list("'self'", `'nonce-${nonce}'`, "'strict-dynamic'", dev && "'unsafe-eval'")}`,
    `connect-src ${list("'self'", api, clerk && `https://${clerk}`, 'https://clerk-telemetry.com', 'https://*.clerk-telemetry.com', 'https://*.protect.clerk.com:*', dev && 'ws:')}`,
    `img-src ${list("'self'", 'data:', 'blob:', api, 'https://img.clerk.com', 'https://tile.openstreetmap.org')}`,
    "frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

