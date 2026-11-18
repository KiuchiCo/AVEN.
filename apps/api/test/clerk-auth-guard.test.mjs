import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ClerkAuthGuard } from '../dist/auth/clerk-auth.guard.js';

const issuer = 'https://clerk.example';
const party = 'http://localhost:3000';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwtKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function makeToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'aven-test', cat: 'cl_B7d4PD111AAA' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: issuer, sub: 'user_external_1', azp: party, iat: now, exp: now + 60, ...overrides })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const signature = sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url');
  return `${unsigned}.${signature}`;
}

function contextFor(token) {
  const request = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const context = { switchToHttp: () => ({ getRequest: () => request }) };
  return { context, request };
}

async function withClerkConfig(run) {
  const keys = ['CLERK_JWT_KEY', 'CLERK_SECRET_KEY', 'CLERK_ISSUER', 'WEB_ORIGIN'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.CLERK_JWT_KEY = jwtKey;
  delete process.env.CLERK_SECRET_KEY;
  process.env.CLERK_ISSUER = issuer;
  process.env.WEB_ORIGIN = party;
  try { await run(); }
  finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('Clerk guard accepts a valid signed session and stores verified identity on the request', async () => {
  await withClerkConfig(async () => {
    const { context, request } = contextFor(makeToken({ sts: 'active' }));
    assert.equal(await new ClerkAuthGuard().canActivate(context), true);
    assert.deepEqual(request.authenticatedIdentity, { issuer, subject: 'user_external_1' });
  });
});

test('Clerk guard rejects invalid signatures, expired sessions, and untrusted issuers or parties', async () => {
  await withClerkConfig(async () => {
    const { context: expired } = contextFor(makeToken({ exp: Math.floor(Date.now() / 1000) - 10 }));
    await assert.rejects(new ClerkAuthGuard().canActivate(expired), UnauthorizedException);

    const token = makeToken();
    const invalidSignature = `${token.slice(0, token.lastIndexOf('.') + 1)}${Buffer.alloc(256).toString('base64url')}`;
    const { context } = contextFor(invalidSignature);
    await assert.rejects(new ClerkAuthGuard().canActivate(context), UnauthorizedException);

    const { context: wrongIssuer } = contextFor(makeToken({ iss: 'https://attacker.example' }));
    await assert.rejects(new ClerkAuthGuard().canActivate(wrongIssuer), UnauthorizedException);

    const { context: wrongParty } = contextFor(makeToken({ azp: 'https://attacker.example' }));
    await assert.rejects(new ClerkAuthGuard().canActivate(wrongParty), UnauthorizedException);
  });
});

test('Clerk guard rejects a session that still requires another sign-in step', async () => {
  await withClerkConfig(async () => {
    const { context } = contextFor(makeToken({ sts: 'pending' }));
    await assert.rejects(new ClerkAuthGuard().canActivate(context), UnauthorizedException);
  });
});

test('Clerk guard reports missing server verification configuration', async () => {
  await withClerkConfig(async () => {
    delete process.env.CLERK_JWT_KEY;
    delete process.env.CLERK_ISSUER;
    const { context } = contextFor(makeToken());
    await assert.rejects(new ClerkAuthGuard().canActivate(context), ServiceUnavailableException);
  });
});

test('Clerk guard rejects requests without a bearer token', async () => {
  const { context } = contextFor(null);
  await assert.rejects(new ClerkAuthGuard().canActivate(context), UnauthorizedException);
});
