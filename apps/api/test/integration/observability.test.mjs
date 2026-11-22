import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

const TOKEN = 'metrics-token-for-tests-0123456789';
describe('monitoring: metrics, health and browser error reports', { skip }, () => {
  let t; let W;
  before(async () => { t = await boot({ METRICS_TOKEN: TOKEN }); await t.user('mo'); W = await t.workspace('mo'); });
  after(async () => { await t?.close(); });
  const metrics = (token) => fetch(`${t.base}/metrics`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

  test('the metrics need the token, and show traffic by route pattern, never by real address', async () => {
    assert.equal((await metrics()).status, 401); assert.equal((await metrics('wrong-token-wrong-token-wrong')).status, 401);
    await t.call('mo', 'GET', `/workspaces/${W.id}/projects`); await t.call(null, 'GET', `/workspaces/${W.id}/projects`);
    await fetch(`${t.base}/health/ready`);
    const response = await metrics(TOKEN); const text = await response.text();
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/plain/); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(text, /http_requests_total\{[^}]*route="\/api\/v1\/workspaces\/:workspaceId\/projects"[^}]*status="2xx"/);
    assert.match(text, /status="4xx"/); assert.match(text, /http_request_duration_seconds_bucket/); assert.match(text, /db_query_duration_seconds_count \d+/); assert.match(text, /db_ping_seconds /);
    assert.ok(!text.includes(W.id) && !text.includes(TOKEN), 'no ids and no token in the output');
  });

  test('browser error reports are accepted without signing in, validated, and limited', async () => {
    const send = (body) => fetch(`${t.base}/telemetry/client-error`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await send({ message: 'x is not a function', stack: 'at Foo (app.js:1:1)', path: `/workspace/documents/${W.id}?token=abc`, kind: 'error' })).status, 204);
    assert.equal((await send({ message: '', kind: 'error' })).status, 400); assert.equal((await send('not an object')).status, 400);
    assert.match(await (await metrics(TOKEN)).text(), /client_errors_total\{kind="error"\} 1/);
    let last = 204; for (let i = 0; i < 25 && last === 204; i += 1) last = (await send({ message: 'again' })).status;
    assert.equal(last, 429, 'a page stuck in an error loop is cut off');
  });
});
