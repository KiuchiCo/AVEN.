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
  assert.equal(readApiEnvironment(base).embeddings, undefined);
  assert.deepEqual(readApiEnvironment({ ...base, EMBEDDINGS_API_KEY: 'k' }).embeddings, { apiKey: 'k', baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small' });
  assert.throws(() => readApiEnvironment({ ...base, EMBEDDINGS_API_KEY: 'k', EMBEDDINGS_BASE_URL: 'http://example.com/v1' }), /EMBEDDINGS_BASE_URL/);
  assert.equal(readApiEnvironment(base).webSearch, undefined);
  assert.equal(readApiEnvironment({ ...base, TAVILY_API_KEY: 'k' }).webSearch.baseUrl, 'https://api.tavily.com');
  assert.throws(() => readApiEnvironment({ ...base, TAVILY_API_KEY: 'k', TAVILY_BASE_URL: 'http://example.com' }), /https/);
});

test('push needs a matching VAPID key pair and subject', async () => {
  const { readApiEnvironment } = await import('../dist/config/api-environment.js');
  const { generateVapidKeys } = await import('../dist/push/push-crypto.js');
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/d' }; const k = generateVapidKeys();
  assert.equal(readApiEnvironment(base).push, undefined);
  assert.throws(() => readApiEnvironment({ ...base, VAPID_PUBLIC_KEY: k.publicKey }), /set together/);
  assert.throws(() => readApiEnvironment({ ...base, VAPID_PUBLIC_KEY: 'abc', VAPID_PRIVATE_KEY: 'def', VAPID_SUBJECT: 'mailto:a@b.co' }), /P-256/);
  assert.throws(() => readApiEnvironment({ ...base, VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey, VAPID_SUBJECT: 'http://x' }), /VAPID_SUBJECT/);
  assert.equal(readApiEnvironment({ ...base, VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey, VAPID_SUBJECT: 'mailto:ops@aven.test' }).push.subject, 'mailto:ops@aven.test');
});

test('the integration summary names what is on and what each missing one needs, and never contains a value', async () => {
  const { integrationStatus } = await import('../dist/config/api-environment.js');
  const base = { DATABASE_URL: 'postgresql://aven:x@localhost:5432/aven' };
  const off = integrationStatus(readApiEnvironment(base));
  assert.ok(off.every((item) => item.on === false || item.name === 'Cloud file storage'), 'nothing is on with no keys');
  assert.equal(off.find((item) => item.name === 'AVEN Intelligence').needs, 'GOOGLE_AI_API_KEY');
  const on = integrationStatus(readApiEnvironment({ ...base, GOOGLE_AI_API_KEY: 'g-secret-value', TAVILY_API_KEY: 'tv-secret-value' }));
  assert.deepEqual(on.filter((item) => item.on).map((item) => item.name), ['AVEN Intelligence', 'Web search']);
  assert.ok(!JSON.stringify(on).includes('secret-value'));
});

test('Cloudflare R2 is configured through the S3 settings: region auto and the account endpoint', () => {
  const base = { DATABASE_URL: 'postgresql://aven:x@localhost:5432/aven' };
  const r2 = readApiEnvironment({ ...base, STORAGE_DRIVER: 's3', S3_BUCKET: 'aven-files', S3_REGION: 'auto', S3_ACCESS_KEY_ID: 'id', S3_SECRET_ACCESS_KEY: 'secret', S3_ENDPOINT: 'https://0123abcd.r2.cloudflarestorage.com' });
  assert.deepEqual([r2.storageDriver, r2.s3.region, r2.s3.endpoint], ['s3', 'auto', 'https://0123abcd.r2.cloudflarestorage.com']);
  assert.throws(() => readApiEnvironment({ ...base, STORAGE_DRIVER: 's3', S3_BUCKET: 'b' }), /S3_ACCESS_KEY_ID/);
  assert.equal(readApiEnvironment(base).storageDriver, 'local', 'with nothing set, files stay on local disk');
});
