import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClientReport, createReporter } from '../app/report-error.ts';

test('a browser error report holds the message, a short stack, the page path without query, and nothing else', () => {
  const report = buildClientReport(new Error('x is not a function'), 'error', '/workspace/tasks?token=secret#top', '1.0');
  assert.equal(report.path, '/workspace/tasks'); assert.equal(report.message, 'x is not a function'); assert.equal(report.release, '1.0'); assert.deepEqual(Object.keys(report).sort(), ['kind', 'message', 'path', 'release', 'stack']);
});

test('browser noise is not reported, and a flood is cut off', () => {
  assert.equal(buildClientReport('Script error.', 'error', '/'), null); assert.equal(buildClientReport(undefined, 'error', '/'), null);
  const sent = []; const report = createReporter('https://api.test/telemetry', (url, body) => sent.push([url, JSON.parse(body)]));
  assert.equal(report(new Error('same'), 'error', '/a'), true); assert.equal(report(new Error('same'), 'error', '/a'), false, 'the same message once');
  for (let i = 0; i < 10; i += 1) report(new Error(`different ${i}`), 'error', '/a');
  assert.equal(sent.length, 5, 'five at most per page');
  assert.equal(createReporter(undefined, () => assert.fail('no endpoint, nothing sent'))(new Error('x'), 'error', '/'), false);
  assert.doesNotThrow(() => createReporter('https://api.test', () => { throw new Error('network'); })(new Error('y'), 'error', '/'));
});
