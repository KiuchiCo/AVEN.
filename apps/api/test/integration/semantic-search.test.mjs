import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

/** A stand-in embeddings provider: words in the same group point the same way, so "paying a bill" is near "invoice". */
const groups = [/invoice|bill|payment|money|pay/, /garden|plant|flower|soil/, /flight|airport|travel|trip/];
const vectorOf = (text) => groups.map((group) => (group.test(text.toLowerCase()) ? 1 : 0)).concat([0.01]);
const requests = [];

describe('semantic search finds items by meaning, only inside the workspace', { skip }, () => {
  let t; let stub; let W; let other;
  before(async () => {
    stub = createServer((request, response) => {
      let raw = ''; request.on('data', (chunk) => { raw += chunk; }); request.on('end', () => {
        const body = JSON.parse(raw); requests.push({ auth: request.headers.authorization, body });
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ data: body.input.map((text, index) => ({ index, embedding: vectorOf(text) })) }));
      });
    });
    await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
    t = await boot({ EMBEDDINGS_API_KEY: 'test-key', EMBEDDINGS_BASE_URL: `http://127.0.0.1:${stub.address().port}/v1` });
    await t.user('sam'); await t.user('eve'); await t.user('gus');
    W = await t.workspace('sam'); other = await t.workspace('eve');
    await t.member(W.id, 'gus', 'GUEST');
  });
  after(async () => { await t?.close(); await new Promise((resolve) => stub.close(resolve)); });

  test('is refused on the free plan, and the status says why', async () => {
    assert.deepEqual((await t.call('sam', 'GET', `/workspaces/${W.id}/search/semantic/status`)).body, { configured: true, entitled: false, total: 0, pending: 0 });
    const refused = await t.call('sam', 'GET', `/workspaces/${W.id}/search/semantic?q=paying%20a%20bill`);
    assert.equal(refused.status, 402); assert.equal(requests.length, 0, 'nothing was sent to the provider');
  });

  test('finds related documents and Knowledge by meaning, never from another workspace', async () => {
    await t.plan(W.id, 'PRO'); await t.plan(other.id, 'PRO');
    const doc = (await t.call('sam', 'POST', `/workspaces/${W.id}/documents`, { title: 'Quarterly invoice run', content: 'Send every invoice and chase late payment.' })).body;
    await t.call('sam', 'POST', `/workspaces/${W.id}/documents`, { title: 'Garden notes', content: 'Plant flower bulbs in autumn soil.' });
    const note = (await t.call('sam', 'POST', `/workspaces/${W.id}/knowledge`, { title: 'Money rules', content: 'Pay suppliers within thirty days.', tags: [] })).body;
    await t.call('eve', 'POST', `/workspaces/${other.id}/documents`, { title: 'Eve invoice secrets', content: 'invoice payment money' });
    assert.equal((await t.call('sam', 'GET', `/workspaces/${W.id}/search/semantic/status`)).body.pending, 3);
    const found = await t.call('sam', 'GET', `/workspaces/${W.id}/search/semantic?q=${encodeURIComponent('paying a bill')}`);
    assert.equal(found.status, 200, JSON.stringify(found.body));
    const titles = found.body.results.map((r) => r.title);
    assert.deepEqual(titles.sort(), ['Money rules', 'Quarterly invoice run']);
    assert.equal(found.body.results.find((r) => r.id === doc.id).href, `/workspace/documents/${doc.id}`);
    assert.ok(found.body.results.every((r) => r.score > 0.25)); assert.ok(requests.every((r) => r.auth === 'Bearer test-key'));
    assert.equal((await t.call('sam', 'GET', `/workspaces/${W.id}/search/semantic/status`)).body.pending, 0);
    // Unchanged items are not embedded again.
    const before = requests.length; await t.call('sam', 'GET', `/workspaces/${W.id}/search/semantic?q=garden`); assert.equal(requests.length, before + 1, 'only the query is embedded');
    // Changing an item re-embeds it, archiving removes it from results.
    await t.call('sam', 'PATCH', `/workspaces/${W.id}/knowledge/${note.id}`, { title: 'Flower beds', content: 'Water the flower beds in the garden.' });
    const moved = (await t.call('sam', 'GET', `/workspaces/${W.id}/search/semantic?q=${encodeURIComponent('paying a bill')}`)).body.results.map((r) => r.title);
    assert.ok(!moved.includes('Money rules') && !moved.includes('Flower beds'));
    await t.call('sam', 'POST', `/workspaces/${W.id}/knowledge/${note.id}/archive`, { archived: true });
    const gone = (await t.call('sam', 'GET', `/workspaces/${W.id}/search/semantic?q=garden`)).body.results.map((r) => r.title);
    assert.ok(gone.includes('Garden notes') && !gone.includes('Flower beds'), 'archived items disappear');
  });

  test('non-members get 404, guests can read, and bad queries are refused', async () => {
    assert.equal((await t.call('eve', 'GET', `/workspaces/${W.id}/search/semantic?q=invoice`)).status, 404);
    assert.equal((await t.call('gus', 'GET', `/workspaces/${W.id}/search/semantic?q=invoice`)).status, 200);
    assert.equal((await t.call('sam', 'GET', `/workspaces/${W.id}/search/semantic?q=a`)).status, 400);
  });
});

describe('semantic search without a provider key', { skip }, () => {
  test('reports itself as awaiting credentials instead of failing', async () => {
    delete process.env.EMBEDDINGS_API_KEY;
    const t = await boot();
    try {
      await t.user('ana'); const W = await t.workspace('ana'); await t.plan(W.id, 'PRO');
      assert.deepEqual((await t.call('ana', 'GET', `/workspaces/${W.id}/search/semantic/status`)).body, { configured: false, entitled: true, total: 0, pending: 0 });
      const unavailable = await t.call('ana', 'GET', `/workspaces/${W.id}/search/semantic?q=invoice`);
      assert.equal(unavailable.status, 503); assert.match(unavailable.body.message, /awaiting an embeddings provider/);
    } finally { await t.close(); }
  });
});
