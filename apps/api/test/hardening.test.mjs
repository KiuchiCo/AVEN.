import assert from 'node:assert/strict';
import { test } from 'node:test';
import { securityHeaders } from '../dist/common/security-headers.js';
import { RateLimitGuard } from '../dist/common/rate-limit.guard.js';
import { readApiEnvironment } from '../dist/config/api-environment.js';

const run = (production) => { const headers = {}; let called = false; securityHeaders(production)({}, { setHeader: (k, v) => { headers[k] = v; } }, () => { called = true; }); return { headers, called }; };
const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', WEB_ORIGIN: 'http://localhost:3000' };

test('security headers are set and the request continues; HSTS only in production', () => {
  const dev = run(false); assert.equal(dev.called, true);
  assert.equal(dev.headers['X-Content-Type-Options'], 'nosniff'); assert.equal(dev.headers['X-Frame-Options'], 'DENY'); assert.match(dev.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal('Strict-Transport-Security' in dev.headers, false);
  assert.match(run(true).headers['Strict-Transport-Security'], /max-age=\d+/);
});
test('TRUST_PROXY accepts true, false or a hop count and rejects anything else', () => {
  assert.equal(readApiEnvironment(base).trustProxy, false);
  assert.equal(readApiEnvironment({ ...base, TRUST_PROXY: 'true' }).trustProxy, true);
  assert.equal(readApiEnvironment({ ...base, TRUST_PROXY: '2' }).trustProxy, 2);
  assert.throws(() => readApiEnvironment({ ...base, TRUST_PROXY: 'maybe' }), /TRUST_PROXY/);
});
test('both health endpoints are exempt from rate limiting', () => {
  const guard = new RateLimitGuard(1, 1000, () => 0);
  for (const path of ['/api/v1/health', '/api/v1/health/ready']) for (let i = 0; i < 4; i += 1) assert.equal(guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ ip: '1.1.1.1', path, headers: {} }) }) }), true);
});
