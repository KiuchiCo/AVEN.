import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

/** Integration tests need a real, migrated PostgreSQL database. Without INTEGRATION_DATABASE_URL they are skipped. */
export const enabled = Boolean(process.env.INTEGRATION_DATABASE_URL);
export const skip = enabled ? false : 'set INTEGRATION_DATABASE_URL to a migrated PostgreSQL database to run integration tests';

/**
 * Starts the real application on a random port. Only Clerk token verification is replaced: the identity comes from
 * an `x-test-user` header instead. Everything else (guards, services, database, validation, filters) is the real thing.
 * Each test file runs in its own process, so `env` only affects that file's app.
 */
export async function boot(env = {}) {
  const run = randomUUID().slice(0, 8);
  Object.assign(process.env, { DATABASE_URL: process.env.INTEGRATION_DATABASE_URL, NODE_ENV: 'test', ...env });
  const [{ NestFactory }, { UnauthorizedException }, { ClerkAuthGuard }, { AppModule }, { PrismaService }, { AllExceptionsFilter }] = await Promise.all([
    import('@nestjs/core'), import('@nestjs/common'), import('../../dist/auth/clerk-auth.guard.js'), import('../../dist/app.module.js'), import('../../dist/database/prisma.service.js'), import('../../dist/common/all-exceptions.filter.js'),
  ]);
  ClerkAuthGuard.prototype.canActivate = function canActivate(context) {
    const request = context.switchToHttp().getRequest();
    const subject = request.headers['x-test-user'];
    if (!subject) throw new UnauthorizedException('A valid sign-in session is required.');
    request.authenticatedIdentity = { issuer: 'https://integration.test', subject };
    return true;
  };
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: false });
  app.useBodyParser('json', { limit: '4mb' });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api/v1`;
  const prisma = app.get(PrismaService);

  const users = new Map();
  const ctx = {
    app, prisma, base, run,
    get: (token) => app.get(token, { strict: false }),
    /** Creates a user. `who` is the name you pass to `call`. */
    async user(name) {
      const row = await prisma.user.create({ data: { email: `${name}-${run}@integration.test`, displayName: name, identityIssuer: 'https://integration.test', identitySubject: `${name}-${run}` } });
      users.set(name, { row, subject: `${name}-${run}` });
      return row;
    },
    async workspace(ownerName, name = 'Workspace') {
      return prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({ data: { name: `${name} ${run}`, createdById: users.get(ownerName).row.id } });
        await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: users.get(ownerName).row.id, role: 'OWNER' } });
        return workspace;
      });
    },
    async member(workspaceId, name, role) {
      return prisma.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId, userId: users.get(name).row.id } }, create: { workspaceId, userId: users.get(name).row.id, role }, update: { role } });
    },
    headers: (name, extra = {}) => ({ 'x-test-user': name ? users.get(name).subject : '', 'content-type': 'application/json', ...extra }),
    /** JSON request as a named user. Returns { status, body }. */
    async call(name, method, path, body) {
      const headers = name === null ? { 'content-type': 'application/json' } : ctx.headers(name);
      const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    /** Raw-body upload as a named user. */
    async upload(name, workspaceId, bytes, query = 'name=file.bin', mime = 'application/octet-stream') {
      const response = await fetch(`${base}/workspaces/${workspaceId}/files/upload?${query}`, { method: 'POST', body: bytes, headers: { 'x-test-user': users.get(name).subject, 'content-type': 'application/octet-stream', 'x-file-mime': mime } });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    async close() { await app.close(); },
  };
  return ctx;
}
