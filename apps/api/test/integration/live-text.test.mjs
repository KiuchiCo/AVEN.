import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { apply } from '@aven/collab';
import { boot, skip } from './harness.mjs';

async function listen(t, who, path) {
  const abort = new AbortController(); const events = [];
  const response = await fetch(`${t.base}${path}`, { headers: t.headers(who), signal: abort.signal });
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) return; buffer += decoder.decode(value); let i; while ((i = buffer.indexOf('\n\n')) >= 0) { const block = buffer.slice(0, i); buffer = buffer.slice(i + 2); const line = block.split('\n').find((l) => l.startsWith('data: ')); if (line) events.push(JSON.parse(line.slice(6))); } } } catch { /* closed */ } })();
  return { events, close: () => abort.abort() };
}
const until = async (fn, what = 'the live event') => { for (let i = 0; i < 100; i += 1) { if (fn()) return; await new Promise((r) => setTimeout(r, 40)); } assert.fail(`timed out waiting for ${what}`); };
const content = (blocks) => JSON.stringify({ format: 'aven-doc-v1', blocks });

describe('live text sessions', { skip }, () => {
  let t; let W; let O; let doc; let maxFeed; let livFeed;
  const P = 'b1', TABLE = 'b2';
  const path = (d = doc, w = W) => `/workspaces/${w.id}/documents/${d.id}`;
  before(async () => {
    t = await boot();
    for (const n of ['liv', 'max', 'gia', 'out']) await t.user(n);
    W = await t.workspace('liv'); await t.member(W.id, 'max', 'MEMBER'); await t.member(W.id, 'gia', 'GUEST'); O = await t.workspace('out');
    doc = (await t.call('liv', 'POST', `/workspaces/${W.id}/documents`, { title: 'Live', content: content([{ id: P, type: 'PARAGRAPH', text: 'hello world' }, { id: TABLE, type: 'TABLE', text: '', rows: [['a']] }]) })).body;
  });
  after(async () => { maxFeed?.close(); livFeed?.close(); await t?.close(); });

  test('two people typing at once end up with both edits, and everyone hears them', async () => {
    // Both have the document open, which keeps its live sessions in memory for the tests that follow.
    maxFeed = await listen(t, 'max', `${path()}/stream`); livFeed = await listen(t, 'liv', `${path()}/stream`);
    await until(() => maxFeed.events.some((e) => e.type === 'presence'));
    const start = await t.call('liv', 'GET', `${path()}/text/${P}`);
    assert.deepEqual(start.body, { text: 'hello world', revision: 0 });
    const first = await t.call('liv', 'POST', `${path()}/text/${P}/ops`, { revision: 0, operation: [5, ' big', 6], clientId: 'tab-a' });
    assert.equal(first.status, 201, JSON.stringify(first.body)); assert.equal(first.body.revision, 1);
    // Max wrote against revision 0 as well, without having seen Liv's edit yet.
    const second = await t.call('max', 'POST', `${path()}/text/${P}/ops`, { revision: 0, operation: [11, '!'], clientId: 'tab-b' });
    assert.equal(second.status, 201); assert.equal(second.body.revision, 2);
    assert.equal(apply(second.body.operation, 'hello big world'), 'hello big world!', 'the edit was moved past the one it did not know about');
    assert.equal((await t.call('liv', 'GET', `${path()}/text/${P}`)).body.text, 'hello big world!');
    await until(() => maxFeed.events.filter((e) => e.type === 'text').length === 2, 'both text events');
    const heard = maxFeed.events.find((e) => e.type === 'text' && e.revision === 1);
    assert.deepEqual({ blockId: heard.blockId, op: heard.operation, by: heard.by.name, clientId: heard.clientId }, { blockId: P, op: [5, ' big', 6], by: 'liv', clientId: 'tab-a' });
  });

  test('typed text is written back to the saved document, and a stale full save cannot undo it', async () => {
    for (let i = 0; i < 80; i += 1) { const row = await t.prisma.document.findUnique({ where: { id: doc.id }, select: { content: true } }); if (row.content.includes('hello big world!')) break; await new Promise((r) => setTimeout(r, 50)); }
    assert.match((await t.prisma.document.findUnique({ where: { id: doc.id }, select: { content: true } })).content, /hello big world!/, 'the database has it, not just the live copy');
    const current = (await t.call('liv', 'GET', path())).body;
    assert.match(current.content, /hello big world!/);
    // The page still has the old text and adds a block; the live text must survive.
    const stale = content([{ id: P, type: 'PARAGRAPH', text: 'hello world' }, { id: TABLE, type: 'TABLE', text: '', rows: [['a']] }, { id: 'b3', type: 'PARAGRAPH', text: 'new block' }]);
    const saved = await t.call('liv', 'PATCH', path(), { content: stale, silent: true, baseUpdatedAt: current.updatedAt });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const blocks = JSON.parse(saved.body.content).blocks;
    assert.equal(blocks.find((b) => b.id === P).text, 'hello big world!'); assert.equal(blocks.length, 3);
    assert.equal(JSON.parse((await t.call('liv', 'GET', path())).body.content).blocks.find((b) => b.id === P).text, 'hello big world!');
  });

  test('guests may read the live text but not edit it; other workspaces and strangers get nothing', async () => {
    assert.equal((await t.call('gia', 'GET', `${path()}/text/${P}`)).status, 200);
    assert.equal((await t.call('gia', 'POST', `${path()}/text/${P}/ops`, { revision: 0, operation: [5] })).status, 403);
    assert.equal((await t.call('out', 'GET', `${path()}/text/${P}`)).status, 404);
    assert.equal((await t.call('out', 'POST', `${path()}/text/${P}/ops`, { revision: 0, operation: [5] })).status, 404);
    assert.equal((await t.call(null, 'GET', `${path()}/text/${P}`)).status, 401);
    assert.equal((await t.call(null, 'POST', `${path()}/text/${P}/ops`, {})).status, 401);
  });

  test('bad edits are refused: malformed (400), unusable (409, reload), or aimed at something that is not live text', async () => {
    const post = (blockId, body) => t.call('liv', 'POST', `${path()}/text/${blockId}/ops`, body);
    const rev = (await t.call('liv', 'GET', `${path()}/text/${P}`)).body.revision; const length = 'hello big world!'.length;
    for (const body of [{}, { revision: -1, operation: [] }, { revision: 'x', operation: [] }, { revision: rev, operation: 'nope' }, { revision: rev, operation: [0] }, { revision: rev, operation: [1.5] }, { revision: rev, operation: [''] }, { revision: rev, operation: [length, 'x'.repeat(50_001)] }, { revision: rev, operation: [length], clientId: '<script>' }]) assert.equal((await post(P, body)).status, 400, JSON.stringify(body).slice(0, 80));
    assert.equal((await post('bad id!', { revision: 0, operation: [] })).status, 400);
    const wrongLength = await post(P, { revision: rev, operation: [3] }); assert.equal(wrongLength.status, 409); assert.equal(wrongLength.body.resync, true);
    assert.equal((await post(P, { revision: rev + 5, operation: [length] })).status, 409, 'from a revision the server has not reached');
    assert.equal((await post(TABLE, { revision: 0, operation: [] })).status, 409, 'tables are not live text');
    assert.equal((await post('nope', { revision: 0, operation: [] })).status, 409);
    assert.equal((await t.call('liv', 'GET', `${path()}/text/${P}`)).body.text, 'hello big world!', 'nothing refused changed the text');
  });

  test('a retired edit source is refused from then on, and fencing is for members who can edit', async () => {
    const fence = (who, body, blockId = P) => t.call(who, 'POST', `${path()}/text/${blockId}/fence`, body);
    const rev = (await t.call('liv', 'GET', `${path()}/text/${P}`)).body;
    assert.equal((await fence('liv', { clientId: 'tab-old' })).status, 204);
    const late = await t.call('liv', 'POST', `${path()}/text/${P}/ops`, { revision: rev.revision, operation: [rev.text.length, '?'], clientId: 'tab-old' });
    assert.equal(late.status, 409); assert.equal(late.body.resync, true);
    const other = await t.call('liv', 'POST', `${path()}/text/${P}/ops`, { revision: rev.revision, operation: [rev.text.length, '?'], clientId: 'tab-new' });
    assert.equal(other.status, 201, 'a different source is unaffected');
    assert.equal((await t.call('liv', 'GET', `${path()}/text/${P}`)).body.text, `${rev.text}?`, 'the late edit changed nothing');
    assert.equal((await fence('liv', { clientId: 'x' }, 'no-such-block')).status, 204, 'nothing live to fence is not an error');
    assert.equal((await fence('liv', {})).status, 400); assert.equal((await fence('liv', { clientId: '<b>' })).status, 400);
    assert.equal((await fence('gia', { clientId: 'tab-g' })).status, 403, 'guests cannot edit');
    assert.equal((await fence('out', { clientId: 'tab-o' })).status, 404);
    assert.equal((await t.call(null, 'POST', `${path()}/text/${P}/fence`, { clientId: 'a' })).status, 401);
  });

  test('the session is released when the last person leaves, and a restored version resets it', async () => {
    const before = (await t.call('liv', 'GET', `${path()}/text/${P}`)).body; const expectedText = `${before.text} Bye`;
    await t.call('liv', 'POST', `${path()}/text/${P}/ops`, { revision: before.revision, operation: [before.text.length, ' Bye'] });
    maxFeed.close(); livFeed.close();
    for (let i = 0; i < 80; i += 1) { if ((await t.call('liv', 'GET', `${path()}/text/${P}`)).body.revision === 0) break; await new Promise((r) => setTimeout(r, 50)); }
    const reopened = (await t.call('liv', 'GET', `${path()}/text/${P}`)).body;
    assert.deepEqual(reopened, { text: expectedText, revision: 0 }, 'saved on close, and a new session starts again at revision 0');
    // restore an earlier version
    const version = (await t.call('liv', 'POST', `${path()}/versions`, { label: 'now' })).body;
    await t.call('liv', 'PATCH', path(), { content: content([{ id: P, type: 'PARAGRAPH', text: 'different' }]), silent: true, baseUpdatedAt: (await t.call('liv', 'GET', path())).body.updatedAt });
    const restored = await t.call('liv', 'POST', `${path()}/versions/${version.id}/restore`, {});
    assert.equal(restored.status, 201, JSON.stringify(restored.body));
    const afterRestore = (await t.call('liv', 'GET', `${path()}/text/${P}`)).body;
    assert.equal(afterRestore.text, expectedText); assert.equal(afterRestore.revision, 0);
    const stale = await t.call('liv', 'POST', `${path()}/text/${P}/ops`, { revision: 3, operation: [afterRestore.text.length] });
    assert.equal(stale.status, 409, 'a client that was editing before the restore is told to reload');
  });
});
