import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from '../dist/common/all-exceptions.filter.js';
import { RateLimitGuard } from '../dist/common/rate-limit.guard.js';
import { requestLogging } from '../dist/common/request-logging.js';

function httpHost(request = { method: 'GET', path: '/api/v1/x' }) {
  const out = { headers: { 'x-request-id': 'req-12345678' } };
  const response = {
    getHeader: (name) => out.headers[name],
    setHeader: (name, value) => { out.headers[name] = value; },
    status(code) { out.status = code; return this; },
    json(body) { out.body = body; },
  };
  return { out, host: { switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }) } };
}

test('HTTP exceptions keep their status and message and gain a request id', () => {
  const { out, host } = httpHost();
  new AllExceptionsFilter().catch(new NotFoundException('Workspace not found.'), host);
  assert.equal(out.status, 404);
  assert.equal(out.body.message, 'Workspace not found.');
  assert.equal(out.body.requestId, 'req-12345678');
});

test('validation errors with a message list are preserved', () => {
  const { out, host } = httpHost();
  new AllExceptionsFilter().catch(new BadRequestException({ message: ['name is required'] }), host);
  assert.equal(out.status, 400);
  assert.deepEqual(out.body.message, ['name is required']);
});

test('unexpected errors become a generic 500 that leaks nothing', () => {
  const { out, host } = httpHost();
  new AllExceptionsFilter().catch(new Error('connect ECONNREFUSED db.internal:5432'), host);
  assert.equal(out.status, 500);
  assert.equal(JSON.stringify(out.body).includes('ECONNREFUSED'), false);
  assert.equal(out.body.requestId, 'req-12345678');
});

test('request logging keeps a valid incoming id and replaces a malformed one', () => {
  for (const [incoming, keep] of [['abcd-1234-efgh', true], ['bad id!<script>', false]]) {
    const headers = {};
    const response = { setHeader: (k, v) => { headers[k] = v; }, on: () => {}, statusCode: 200 };
    let called = false;
    requestLogging({ header: () => incoming, method: 'GET', path: '/' }, response, () => { called = true; });
    assert.equal(called, true);
    assert.equal(headers['x-request-id'] === incoming, keep);
  }
});

function ctx(ip, path = '/api/v1/projects') {
  const headers = {};
  return { headers, context: { switchToHttp: () => ({ getRequest: () => ({ ip, path }), getResponse: () => ({ setHeader: (k, v) => { headers[k] = v; } }) }) } };
}

test('rate limiter blocks after the limit, per client, and resets next window', () => {
  let now = 0;
  const guard = new RateLimitGuard(2, 1000, () => now);
  const a = ctx('1.1.1.1');
  assert.equal(guard.canActivate(a.context), true);
  assert.equal(guard.canActivate(a.context), true);
  assert.throws(() => guard.canActivate(a.context), (e) => e instanceof HttpException && e.getStatus() === 429);
  assert.equal(a.headers['Retry-After'], 1);
  assert.equal(guard.canActivate(ctx('2.2.2.2').context), true);
  now = 1001;
  assert.equal(guard.canActivate(a.context), true);
});

test('health checks are never rate limited', () => {
  const guard = new RateLimitGuard(1, 1000, () => 0);
  for (let i = 0; i < 5; i += 1) assert.equal(guard.canActivate(ctx('1.1.1.1', '/api/v1/health').context), true);
});

test('security: an error on a share-link or invitation address is logged without the secret token', async () => {
  const { Logger } = await import('@nestjs/common');
  const lines = []; const original = Logger.prototype.error;
  Logger.prototype.error = function capture(...args) { lines.push(args.map(String).join(' ')); };
  try {
    for (const path of ['/api/v1/shared/documents/SECRET-TOKEN-123/images/x', '/api/v1/invitations/SECRET-TOKEN-123/accept']) {
      const { host } = httpHost({ method: 'GET', path });
      new AllExceptionsFilter().catch(new Error('boom'), host);
    }
  } finally { Logger.prototype.error = original; }
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => !line.includes('SECRET-TOKEN-123') && line.includes(':token')), lines.join('\n'));
});

test('a database uniqueness clash or a record deleted mid-request is a clear 409 or 404, never a 500, and leaks nothing', () => {
  const prismaError = (code) => Object.assign(new Error(`Invalid prisma.task.update() invocation: secret detail ${code}`), { name: 'PrismaClientKnownRequestError', code });
  let { out, host } = httpHost();
  new AllExceptionsFilter().catch(prismaError('P2002'), host);
  assert.equal(out.status, 409); assert.doesNotMatch(JSON.stringify(out.body), /prisma|secret/i); assert.equal(out.body.requestId, 'req-12345678');
  ({ out, host } = httpHost());
  new AllExceptionsFilter().catch(prismaError('P2025'), host);
  assert.equal(out.status, 404); assert.doesNotMatch(JSON.stringify(out.body), /prisma|secret/i);
  ({ out, host } = httpHost());
  new AllExceptionsFilter().catch(prismaError('P1001'), host);
  assert.equal(out.status, 500, 'other database failures stay a generic 500');
});
