import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

/** A stand-in embeddings provider: words in the same group point the same way, so "paying a bill" is near "invoice". */
const groups = [/invoice|bill|payment|money|pay/, /garden|plant|flower|soil/, /flight|airport|travel|trip/];
const vectorOf = (text) => groups.map((group) => (group.test(text.toLowerCase()) ? 1 : 0)).concat([0.01]);
const requests = [];

describe('semantic search finds items by meaning, only inside the workspace', { skip }, () => {
  let t; let stub; let W; let other; let storage;
  before(async () => {
    stub = createServer((request, response) => {
      let raw = ''; request.on('data', (chunk) => { raw += chunk; }); request.on('end', () => {
        const body = JSON.parse(raw); requests.push({ auth: request.headers.authorization, body });
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ data: body.input.map((text, index) => ({ index, embedding: vectorOf(text) })) }));
      });
    });
    await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
    storage = await mkdtemp(join(tmpdir(), 'aven-semantic-'));
    t = await boot({ STORAGE_DIR: storage, EMBEDDINGS_API_KEY: 'test-key', EMBEDDINGS_BASE_URL: `http://127.0.0.1:${stub.address().port}/v1` });
    await t.user('sam'); await t.user('eve'); await t.user('gus');
    W = await t.workspace('sam'); other = await t.workspace('eve');
    await t.member(W.id, 'gus', 'GUEST');
  });
  after(async () => { await t?.close(); await new Promise((resolve) => stub.close(resolve)); await rm(storage, { recursive: true, force: true }); });

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

  test('tasks are found by meaning too, but a task of a team-only project is only found by people on its team', async () => {
    await t.user('mia'); await t.member(W.id, 'mia', 'MEMBER');
    const project = (await t.call('sam', 'POST', `/workspaces/${W.id}/projects`, { name: 'Quiet project', visibility: 'TEAM' })).body;
    const open = (await t.call('sam', 'POST', `/workspaces/${W.id}/tasks`, { title: 'Pay the electricity bill', description: 'Money due on Friday' })).body;
    const hidden = (await t.call('sam', 'POST', `/workspaces/${W.id}/tasks`, { title: 'Settle the supplier invoice', description: 'Confidential payment terms', projectId: project.id })).body;
    await t.call('eve', 'POST', `/workspaces/${other.id}/tasks`, { title: 'Eve pays a secret bill', description: 'invoice money' });
    const as = async (who) => (await t.call(who, 'GET', `/workspaces/${W.id}/search/semantic?q=${encodeURIComponent('paying a bill')}`)).body;
    const mine = await as('sam'); const theirs = await as('mia');
    assert.ok(mine.results.some((r) => r.id === open.id && r.type === 'Task' && r.href === `/workspace/tasks/${open.id}`), 'the owner finds the open task');
    assert.ok(mine.results.some((r) => r.id === hidden.id), 'and the team-only one');
    assert.ok(theirs.results.some((r) => r.id === open.id), 'a member finds the open task');
    assert.ok(!JSON.stringify(theirs).includes(hidden.id) && !JSON.stringify(theirs).includes('Confidential') && !JSON.stringify(theirs).includes('supplier invoice'), 'but nothing of the team-only task');
    assert.ok(!JSON.stringify(mine).includes('secret bill') && !JSON.stringify(theirs).includes('secret bill'), 'and nothing from another workspace');
    await t.call('sam', 'DELETE', `/workspaces/${W.id}/tasks/${open.id}`);
    assert.ok(!(await as('sam')).results.some((r) => r.id === open.id), 'a deleted task stops being found');
  });

  test('uploaded files are found by their content, with a short excerpt and never the whole file, and respect deletion, workspaces and hidden projects', async () => {
    await t.user('fay'); await t.member(W.id, 'fay', 'MEMBER');
    const long = `Settle every supplier invoice and pay the bill on time. ${'Filler words about nothing in particular. '.repeat(80)}SECRET-TAIL-MARKER`;
    const file = (await t.upload('sam', W.id, Buffer.from(long), 'name=suppliers.txt', 'text/plain')).body;
    const binary = (await t.upload('sam', W.id, Buffer.from([1, 2, 3, 0, 4]), 'name=blob.bin', 'application/octet-stream')).body;
    await t.upload('eve', other.id, Buffer.from('Eve pays her secret bill and invoice money.'), 'name=eve.txt', 'text/plain');
    const find = async (who) => (await t.call(who, 'GET', `/workspaces/${W.id}/search/semantic?q=${encodeURIComponent('paying a bill')}`)).body;
    const found = await find('sam'); const hit = found.results.find((r) => r.id === file.id);
    assert.ok(hit, 'the file is found by what is inside it'); assert.equal(hit.type, 'File'); assert.equal(hit.title, 'suppliers.txt');
    assert.ok(hit.detail.length <= 400 && !hit.detail.includes('SECRET-TAIL-MARKER'), 'an excerpt, not the file'); assert.ok(hit.updatedAt);
    assert.ok(!found.results.some((r) => r.id === binary.id), 'files that cannot be read as text are not indexed');
    assert.ok(!JSON.stringify(found).includes('Eve pays'), 'nothing from another workspace');
    // a file attached to a task of a team-only project is not shown to people outside that team
    const project = (await t.call('sam', 'POST', `/workspaces/${W.id}/projects`, { name: 'Closed', visibility: 'TEAM' })).body;
    const task = (await t.call('sam', 'POST', `/workspaces/${W.id}/tasks`, { title: 'Closed task', projectId: project.id })).body;
    assert.equal((await t.call('sam', 'POST', `/workspaces/${W.id}/files/attachments`, { fileId: file.id, taskId: task.id })).status, 201);
    assert.ok((await find('sam')).results.some((r) => r.id === file.id), 'the team still finds it'); assert.ok(!(await find('fay')).results.some((r) => r.id === file.id), 'a member outside the team does not');
    // a changed file is read again, a deleted one disappears
    await t.call('sam', 'DELETE', `/workspaces/${W.id}/files/attachments/${(await t.call('sam', 'GET', `/workspaces/${W.id}/files/attachments?taskId=${task.id}`)).body[0].id}`);
    assert.equal((await t.call('sam', 'DELETE', `/workspaces/${W.id}/files/${file.id}`)).status, 200);
    assert.ok(!(await find('sam')).results.some((r) => r.id === file.id), 'a deleted file stops being found');
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
