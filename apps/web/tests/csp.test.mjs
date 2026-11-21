import assert from 'node:assert/strict';
import test from 'node:test';
import { contentSecurityPolicy } from '../csp.ts';

const env = { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${btoa('able-dove-1.clerk.accounts.dev$')}`, NEXT_PUBLIC_API_BASE_URL: 'https://api.aven.test/api/v1' };
const directive = (policy, name) => policy.split('; ').find((part) => part.startsWith(`${name} `)) ?? '';

test('security: scripts need this request’s nonce; there is no unsafe-inline or unsafe-eval in production', () => {
  const policy = contentSecurityPolicy('N0NCE', false, env);
  const scripts = directive(policy, 'script-src');
  assert.ok(scripts.includes("'nonce-N0NCE'") && scripts.includes("'strict-dynamic'") && scripts.includes("'self'"));
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|(^|\s)\*(?=\s|;|$)|\shttps:(?=\s|;|$)|\shttp:(?=\s|;|$)/, 'no bare wildcard or blanket scheme sources');
  assert.ok(directive(policy, 'connect-src').includes('https://*.protect.clerk.com:*'), 'the one wildcard is Clerk’s bot protection, on any port, as Clerk documents');
  assert.doesNotMatch(directive(policy, 'connect-src'), /ws:/);
});

test('development adds only what the dev server needs', () => {
  const policy = contentSecurityPolicy('N0NCE', true, env);
  assert.match(directive(policy, 'script-src'), /'unsafe-eval'/); assert.match(directive(policy, 'connect-src'), /ws:/);
  assert.doesNotMatch(directive(policy, 'script-src'), /unsafe-inline/);
});

test('the policy lets the app reach its own API and Clerk, and nothing else, and blocks framing, plugins and base changes', () => {
  const policy = contentSecurityPolicy('N0NCE', false, env);
  const connect = directive(policy, 'connect-src');
  assert.ok(connect.includes('https://api.aven.test') && connect.includes('https://able-dove-1.clerk.accounts.dev'));
  for (const [name, value] of [['object-src', "'none'"], ['base-uri', "'self'"], ['form-action', "'self'"], ['frame-ancestors', "'self'"]]) assert.equal(directive(policy, name), `${name} ${value}`);
  const bare = contentSecurityPolicy('N0NCE', false, {});
  assert.ok(directive(bare, 'connect-src').startsWith("connect-src 'self' https://clerk-telemetry.com"), 'missing settings add no origins');
});

test('every request gets its own nonce value in the policy', () => {
  assert.notEqual(contentSecurityPolicy('a', false, env), contentSecurityPolicy('b', false, env));
});
