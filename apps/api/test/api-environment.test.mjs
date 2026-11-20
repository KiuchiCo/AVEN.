import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readApiEnvironment } from '../dist/config/api-environment.js';

const databaseUrl = 'postgresql://aven:local-only@localhost:5432/aven?schema=public';

test('API environment applies safe local defaults and parses workspace origins', () => {
  const environment = readApiEnvironment({ DATABASE_URL: databaseUrl });
  assert.equal(environment.apiPort, 4000);
  assert.deepEqual(environment.webOrigins, ['http://localhost:3000']);
  assert.equal(environment.databaseUrl, databaseUrl);
  assert.equal(environment.isProduction, false);
});

test('API environment accepts comma-separated origins and escaped Clerk PEM newlines', () => {
  const pem = '-----BEGIN PUBLIC KEY-----\\nPUBLIC-KEY-DATA\\n-----END PUBLIC KEY-----';
  const environment = readApiEnvironment({
    DATABASE_URL: databaseUrl,
    API_PORT: '4400',
    WEB_ORIGIN: 'https://aven.example,https://preview.aven.example',
    CLERK_JWT_KEY: pem,
    CLERK_ISSUER: 'https://clerk.example',
  });
  assert.equal(environment.apiPort, 4400);
  assert.deepEqual(environment.webOrigins, ['https://aven.example', 'https://preview.aven.example']);
  assert.equal(environment.clerkJwtKey, pem.replaceAll('\\n', '\n'));
});

test('API environment rejects invalid ports, origins, database URLs, and partial Clerk configuration', () => {
  for (const [input, expected] of [
    [{ DATABASE_URL: databaseUrl, API_PORT: '70000' }, 'API_PORT'],
    [{ DATABASE_URL: databaseUrl, WEB_ORIGIN: 'https://aven.example/workspace' }, 'WEB_ORIGIN'],
    [{ DATABASE_URL: 'mysql://localhost/aven' }, 'DATABASE_URL'],
    [{ DATABASE_URL: databaseUrl, CLERK_SECRET_KEY: 'secret-value' }, 'CLERK_ISSUER'],
    [{ DATABASE_URL: databaseUrl, CLERK_JWT_KEY: 'not-a-pem', CLERK_ISSUER: 'https://clerk.example' }, 'CLERK_JWT_KEY'],
  ]) {
    assert.throws(() => readApiEnvironment(input), (error) => {
      assert.match(error.message, new RegExp(expected));
      assert.equal(error.message.includes('secret-value'), false);
      return true;
    });
  }
});

test('production requires Clerk verification credentials and an issuer', () => {
  assert.throws(
    () => readApiEnvironment({ DATABASE_URL: databaseUrl, NODE_ENV: 'production' }),
    /production requires CLERK_ISSUER and a Clerk verification key/,
  );
});

test('s3 storage requires its credentials and exposes them when set', async () => {
  const { readApiEnvironment } = await import('../dist/config/api-environment.js');
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/d', STORAGE_DRIVER: 's3' };
  assert.throws(() => readApiEnvironment(base), /S3_BUCKET/);
  const env = readApiEnvironment({ ...base, S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'a', S3_SECRET_ACCESS_KEY: 's' });
  assert.equal(env.storageDriver, 's3');
  assert.equal(env.s3.region, 'us-east-1');
});

test('web search is optional and needs a safe base URL', async () => {
  const { readApiEnvironment } = await import('../dist/config/api-environment.js');
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/d' };
  assert.equal(readApiEnvironment(base).webSearch, undefined);
  assert.equal(readApiEnvironment({ ...base, WEB_SEARCH_API_KEY: 'k' }).webSearch.baseUrl, 'https://api.search.brave.com');
  assert.throws(() => readApiEnvironment({ ...base, WEB_SEARCH_API_KEY: 'k', WEB_SEARCH_BASE_URL: 'http://example.com' }), /https/);
});
