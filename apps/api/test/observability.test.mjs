import assert from 'node:assert/strict';
import test from 'node:test';
import { ErrorReporter } from '../dist/observability/error-reporter.js';
import { JsonLogger } from '../dist/observability/json-logger.js';
import { Metrics, metrics } from '../dist/observability/metrics.js';
import { requestContext } from '../dist/observability/request-context.js';
import { scrub, scrubPath } from '../dist/observability/scrub.js';
import { readApiEnvironment } from '../dist/config/api-environment.js';

test('security: secrets and personal details are taken out of text before it is logged or reported', () => {
  const secret = [
    'Authorization: Bearer abcdefghijklmnop1234567890', 'token=abcd1234efgh5678', 'postgresql://aven:hunter2hunter2@db:5432/aven', 'key sk_live_abcdefghijklmnop1234',
    'jwt eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEifQ.c2lnbmF0dXJlc2lnbmF0dXJl', 'mail person@example.com', 'GET /api/v1/shared/documents/AbCdEf123456SecretToken/images/x',
  ].join(' | ');
  const clean = scrub(secret);
  for (const leak of ['abcdefghijklmnop1234567890', 'abcd1234efgh5678', 'hunter2hunter2', 'sk_live_abcdefghijklmnop1234', 'eyJzdWIiOiJ1c2VyXzEifQ', 'person@example.com', 'SecretToken']) assert.ok(!clean.includes(leak), leak);
  assert.equal(scrubPath('/workspace/documents/3f2b8c1e-aaaa-4bbb-8ccc-123456789abc?token=secret#frag'), '/workspace/documents/:id');
});

test('metrics render in the Prometheus text format, with bounded series', () => {
  const m = new Metrics(); m.describe('hits_total', 'Hits.');
  m.inc('hits_total', { route: '/a', status: '2xx' }); m.inc('hits_total', { route: '/a', status: '2xx' }, 2); m.set('depth', 7); m.observe('took_seconds', 0.2, { route: '/a' }); m.observe('took_seconds', 3, { route: '/a' });
  const text = m.render();
  assert.match(text, /# TYPE hits_total counter/); assert.match(text, /hits_total\{route="\/a",status="2xx"\} 3/); assert.match(text, /depth 7/);
  assert.match(text, /took_seconds_bucket\{route="\/a",le="0.25"\} 1/); assert.match(text, /took_seconds_bucket\{route="\/a",le="\+Inf"\} 2/); assert.match(text, /took_seconds_count\{route="\/a"\} 2/);
  for (let i = 0; i < 3000; i += 1) m.inc('runaway_total', { id: String(i) });
  assert.ok(m.render().split('\n').filter((line) => line.startsWith('runaway_total{')).length <= 2000, 'a label that never repeats cannot grow memory without limit');
});

test('error tracking is off without a DSN, and sends a scrubbed event, never request data, when configured', async () => {
  const sent = [];
  const off = new ErrorReporter(async (url, init) => { sent.push({ url, init }); return { ok: true }; });
  off.configure({ environment: 'test' }); off.capture(new Error('x'), { area: 'http' });
  assert.equal(sent.length, 0); assert.equal(off.enabled, false);
  const on = new ErrorReporter(async (url, init) => { sent.push({ url, init }); return { ok: true }; });
  on.configure({ dsn: 'https://publickey@tracker.example/42', environment: 'production', release: '1.2.3' });
  assert.equal(on.enabled, true);
  on.capture(new Error('failed for person@example.com with Bearer abcdefghijklmnop1234567890'), { area: 'http', route: '/api/v1/tasks/:id', method: 'GET', status: 500, requestId: 'req-1' });
  assert.equal(sent.length, 1); assert.equal(sent[0].url, 'https://tracker.example/api/42/envelope/');
  assert.match(sent[0].init.headers['x-sentry-auth'], /sentry_key=publickey/);
  const [header, item, event] = sent[0].init.body.split('\n').map((line) => JSON.parse(line));
  assert.equal(item.type, 'event'); assert.equal(header.dsn, 'https://publickey@tracker.example/42'); assert.equal(event.release, '1.2.3'); assert.equal(event.tags.route, '/api/v1/tasks/:id');
  assert.ok(!JSON.stringify(event).includes('person@example.com') && !JSON.stringify(event).includes('abcdefghijklmnop1234567890'));
  assert.equal('request' in event, false, 'no request section: no headers, cookies or bodies');
  for (let i = 0; i < 60; i += 1) on.capture(new Error(`again ${i}`), { area: 'http' });
  assert.ok(sent.length <= 31, `a flood is capped (${sent.length} sent)`);
});

test('a broken tracker or a bad DSN never breaks the caller', async () => {
  const reporter = new ErrorReporter(async () => { throw new Error('tracker down'); });
  reporter.configure({ dsn: 'not a url', environment: 'x' }); assert.equal(reporter.enabled, false);
  reporter.configure({ dsn: 'https://k@tracker.example/1', environment: 'x' });
  assert.doesNotThrow(() => reporter.capture(new Error('x'), { area: 'job:test' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(metrics.render(), /error_reports_total\{area="job:test",sent="failed"\}/);
});

test('logs are one JSON object per line, with level, request id and no secrets', () => {
  const lines = []; const logger = new JsonLogger('log', (stream, line) => lines.push({ stream, ...JSON.parse(line) }));
  requestContext.run({ requestId: 'req-abc12345' }, () => {
    logger.log('Calendar connected for Bearer abcdefghijklmnop1234567890', 'CalendarSync');
    logger.warn(JSON.stringify({ requestId: 'x', method: 'GET', path: '/api/v1/invitations/:token', status: 404 }), 'Request');
    logger.error('Could not send an email: person@example.com', 'line one\n    at somewhere', 'Mail');
  });
  logger.debug('hidden at the log level');
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((line) => line.level), ['info', 'warn', 'error']); assert.deepEqual(lines.map((line) => line.stream), ['out', 'out', 'err']);
  assert.ok(lines.every((line) => /^\d{4}-\d\d-\d\dT/.test(line.time)));
  assert.equal(lines[0].requestId, 'req-abc12345'); assert.equal(lines[0].context, 'CalendarSync');
  assert.ok(!JSON.stringify(lines).includes('abcdefghijklmnop1234567890') && !JSON.stringify(lines).includes('person@example.com'));
  assert.equal(lines[1].status, 404); assert.ok(lines[2].stack?.includes('somewhere'));
});

test('monitoring settings are validated', () => {
  const base = { DATABASE_URL: 'postgresql://a:b@localhost:5432/x' };
  assert.equal(readApiEnvironment(base).monitoring.errorTrackingDsn, undefined);
  assert.equal(readApiEnvironment({ ...base, ERROR_TRACKING_DSN: 'https://k@tracker.example/9', METRICS_TOKEN: 'x'.repeat(24) }).monitoring.metricsToken, 'x'.repeat(24));
  assert.throws(() => readApiEnvironment({ ...base, ERROR_TRACKING_DSN: 'tracker.example' }), /ERROR_TRACKING_DSN/);
  assert.throws(() => readApiEnvironment({ ...base, METRICS_TOKEN: 'short' }), /METRICS_TOKEN/);
});

test('a call to an outside service that never answers is cut off, and one that answers in time is untouched', async () => {
  const { withTimeout } = await import('../dist/observability/with-timeout.js');
  await assert.rejects(withTimeout(new Promise(() => {}), 30, 'too slow'), /too slow/);
  assert.equal(await withTimeout(Promise.resolve(7), 1000, 'too slow'), 7);
  await assert.rejects(withTimeout(Promise.reject(new Error('real failure')), 1000, 'too slow'), /real failure/);
});

test('REALTIME_BUS is memory or postgres, and a bus that is not enabled sends nothing', async () => {
  const base = { DATABASE_URL: 'postgresql://a:b@localhost:5432/x' };
  assert.equal(readApiEnvironment(base).realtimeBus, 'memory'); assert.equal(readApiEnvironment({ ...base, REALTIME_BUS: 'postgres' }).realtimeBus, 'postgres');
  assert.throws(() => readApiEnvironment({ ...base, REALTIME_BUS: 'redis' }), /REALTIME_BUS/);
  const { RealtimeBus } = await import('../dist/realtime/realtime-bus.js');
  const off = new RealtimeBus(); assert.equal(off.enabled, false); await off.onModuleInit(); await off.publish({ topic: 'channel', scope: 'w', event: {} });
});
