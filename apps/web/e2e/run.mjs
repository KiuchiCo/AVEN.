// Runs the browser tests against a throwaway database and a fresh API and web server, then cleans up.
// Usage: npm run test:e2e --workspace @aven/web   (needs Postgres running, a built API, and Google Chrome installed)
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const apiDir = `${root}apps/api`;
const webDir = `${root}apps/web`;
const require = createRequire(`${apiDir}/package.json`);
const { Client } = require('pg');

const env = Object.fromEntries(existsSync(`${root}.env`) ? readFileSync(`${root}.env`, 'utf8').split('\n').filter((line) => /^[A-Z_]+=/.test(line)).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).replace(/^["']|["']$/g, '')]) : []);
const adminUrl = process.env.E2E_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL ?? env.DATABASE_URL;
if (!adminUrl) { console.error('Set DATABASE_URL (or E2E_ADMIN_DATABASE_URL) to a PostgreSQL server the tests may create a database on.'); process.exit(2); }
const e2eName = `aven_e2e_${randomBytes(3).toString('hex')}`;
const e2eUrl = (() => { const url = new URL(adminUrl); url.pathname = `/${e2eName}`; url.search = ''; return url.toString(); })();
const ports = { api: 4100, web: 3100 };
if (!existsSync(`${apiDir}/dist/main.js`)) { console.log('Building the API first…'); if (spawnSync('npm', ['run', 'build'], { cwd: apiDir, stdio: 'inherit' }).status !== 0) process.exit(2); }

const admin = new Client({ connectionString: adminUrl }); await admin.connect();
let status = 1;
let clerkUserId = null;
// Next rewrites these two tracked files when it starts with another build folder; put them back afterwards.
const touched = ['next-env.d.ts', 'tsconfig.json'].map((name) => [`${webDir}/${name}`, readFileSync(`${webDir}/${name}`, 'utf8')]);
try {
  await admin.query(`CREATE DATABASE "${e2eName}"`);
  const migrate = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: apiDir, env: { ...process.env, DATABASE_URL: e2eUrl }, stdio: 'pipe' });
  if (migrate.status !== 0) { console.error(String(migrate.stdout), String(migrate.stderr)); throw new Error('Migrations failed.'); }

  // Seed: one workspace, one document, and three share links (active, revoked, expired). Only hashes are stored, as in the app.
  const db = new Client({ connectionString: e2eUrl }); await db.connect();
  const ids = { user: randomUUID(), workspace: randomUUID(), document: randomUUID() };
  const blocks = [
    { id: 'a', type: 'HEADING_1', text: 'Launch plan' }, { id: 'b', type: 'PARAGRAPH', text: 'Everything here is read only.' },
    { id: 'c', type: 'BULLET', text: 'First bullet' }, { id: 'd', type: 'NUMBERED', text: 'Step one' }, { id: 'e', type: 'NUMBERED', text: 'Step two' },
    { id: 'f', type: 'TODO', text: 'Ship it', checked: true }, { id: 'g', type: 'TABLE', text: '', rows: [['Owner', 'Due', 'A very long cell value that should never push the page wider than a phone screen can show on its own'], ['Ana', 'Friday', 'ok']] },
    { id: 'h', type: 'PARAGRAPH', text: '<img src=x onerror="window.__pwned=1"> <script>window.__pwned=1</script>' },
    { id: 'i', type: 'DATABASE', databaseId: randomUUID(), view: 'TABLE' }, { id: 'j', type: 'PAGE_LINK', docId: randomUUID() },
  ];
  await db.query(`INSERT INTO users (id, email, "displayName", "updatedAt") VALUES ($1, $2, 'E2E Owner', now())`, [ids.user, `e2e-${randomBytes(3).toString('hex')}@example.test`]);
  await db.query(`INSERT INTO workspaces (id, name, "createdById", "updatedAt") VALUES ($1, 'E2E workspace', $2, now())`, [ids.workspace, ids.user]);
  await db.query(`INSERT INTO workspace_members (id, "workspaceId", "userId", role, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'OWNER', now())`, [ids.workspace, ids.user]);
  await db.query(`INSERT INTO documents (id, "workspaceId", title, content, "updatedAt") VALUES ($1, $2, 'Launch plan', $3, now())`, [ids.document, ids.workspace, JSON.stringify({ format: 'aven-doc-v1', blocks })]);
  const tokens = { active: randomBytes(24).toString('base64url'), revoked: randomBytes(24).toString('base64url'), expired: randomBytes(24).toString('base64url'), download: randomBytes(24).toString('base64url') };
  const share = (token, revokedAt, expiresAt, allowDownload = false) => db.query(`INSERT INTO document_shares (id, "workspaceId", "documentId", "createdById", "tokenHash", "revokedAt", "expiresAt", "allowDownload") VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)`, [ids.workspace, ids.document, ids.user, createHash('sha256').update(token).digest('hex'), revokedAt, expiresAt, allowDownload]);
  await share(tokens.active, null, null); await share(tokens.download, null, null, true); await share(tokens.revoked, new Date(), null); await share(tokens.expired, null, new Date(Date.now() - 86_400_000));
  await db.end();

  // Signed-in tests need a user of the Clerk DEVELOPMENT instance. Unless one is named, a throwaway one is made here through Clerk's
  // backend API and deleted afterwards (finally, below). Never with a production key; never with a password: the tests sign in with one-time tickets.
  if (!process.env.E2E_CLERK_USER_EMAIL && (env.CLERK_SECRET_KEY ?? '').startsWith('sk_test_') && process.env.E2E_NO_TEST_USER !== '1') {
    const email = `aven-e2e-${randomBytes(4).toString('hex')}+clerk_test@example.com`;
    const created = await fetch('https://api.clerk.com/v1/users', { method: 'POST', headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email_address: [email], first_name: 'AVEN', last_name: 'E2E', skip_password_requirement: true }) });
    if (created.ok) { clerkUserId = (await created.json()).id; process.env.E2E_CLERK_USER_EMAIL = email; console.log('Signed-in tests use a throwaway Clerk test user (deleted afterwards).'); }
    else console.log(`Could not create a Clerk test user (HTTP ${created.status}): signed-in tests will be skipped.`);
  }
  const shared = { ...process.env, E2E_API_PORT: String(ports.api), E2E_WEB_PORT: String(ports.web), E2E_DATABASE_URL: e2eUrl, E2E_TOKEN_ACTIVE: tokens.active, E2E_TOKEN_REVOKED: tokens.revoked, E2E_TOKEN_EXPIRED: tokens.expired, E2E_TOKEN_DOWNLOAD: tokens.download, E2E_CLERK_PUBLISHABLE_KEY: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '', E2E_CLERK_SECRET_KEY: env.CLERK_SECRET_KEY ?? '',
    // @clerk/testing (clerkSetup, sign-in tickets) reads these names in the test process itself.
    CLERK_PUBLISHABLE_KEY: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '', CLERK_SECRET_KEY: env.CLERK_SECRET_KEY ?? '' };
  const result = spawnSync('npx', ['playwright', 'test', '--config', 'e2e/playwright.config.ts', ...process.argv.slice(2)], { cwd: webDir, env: shared, stdio: 'inherit' });
  status = result.status ?? 1;
} catch (error) { console.error(error instanceof Error ? error.message : error); } finally {
  for (const [file, content] of touched) writeFileSync(file, content);
  if (clerkUserId) {
    const removed = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` } }).catch(() => null);
    console.log(removed?.ok ? 'Throwaway Clerk test user deleted.' : `Could not delete the throwaway Clerk test user ${clerkUserId}: remove it in the Clerk dashboard.`);
  }
  await admin.query(`DROP DATABASE IF EXISTS "${e2eName}" WITH (FORCE)`).catch(() => undefined); await admin.end();
}
process.exit(status);
