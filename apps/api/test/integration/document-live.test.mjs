import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

async function listen(t, who, path) {
  const abort = new AbortController(); const events = [];
  const response = await fetch(`${t.base}${path}`, { headers: t.headers(who), signal: abort.signal });
  if (!response.ok) { abort.abort(); return { status: response.status, events, close() {} }; }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) return; buffer += decoder.decode(value); let i; while ((i = buffer.indexOf('\n\n')) >= 0) { const block = buffer.slice(0, i); buffer = buffer.slice(i + 2); const line = block.split('\n').find((l) => l.startsWith('data: ')); if (line) events.push(JSON.parse(line.slice(6))); } } } catch { /* closed */ } })();
  return { status: 200, events, close: () => abort.abort() };
}
const until = async (fn) => { for (let i = 0; i < 60; i += 1) { if (fn()) return; await new Promise((r) => setTimeout(r, 40)); } assert.fail('timed out waiting for the live event'); };

describe('live documents', { skip }, () => {
  let t; let W; let O; let doc; let otherDoc;
  const path = (d = doc, w = W) => `/workspaces/${w.id}/documents/${d.id}`;
  before(async () => {
    t = await boot();
    for (const n of ['zoe', 'yan', 'xia', 'wes']) await t.user(n);
    W = await t.workspace('zoe'); await t.member(W.id, 'yan', 'MEMBER'); await t.member(W.id, 'xia', 'GUEST'); O = await t.workspace('wes');
    doc = (await t.call('zoe', 'POST', `/workspaces/${W.id}/documents`, { title: 'Plan', content: '' })).body;
    otherDoc = (await t.call('wes', 'POST', `/workspaces/${O.id}/documents`, { title: 'Theirs', content: '' })).body;
  });
  after(async () => { await t?.close(); });

  test('viewers see each other come and go, and hear when someone saves', async () => {
    const zoe = await listen(t, 'zoe', `${path()}/stream`);
    assert.equal(zoe.status, 200);
    await until(() => zoe.events.some((e) => e.type === 'presence' && e.viewers.length === 1));
    const yan = await listen(t, 'yan', `${path()}/stream`);
    await until(() => zoe.events.some((e) => e.type === 'presence' && e.viewers.map((v) => v.name).sort().join() === 'yan,zoe'));
    const saved = await t.call('yan', 'PATCH', path(), { content: '{"format":"aven-doc-v1","blocks":[]}', silent: true, baseUpdatedAt: doc.updatedAt });
    assert.equal(saved.status, 200);
    await until(() => zoe.events.some((e) => e.type === 'saved'));
    const event = zoe.events.find((e) => e.type === 'saved');
    assert.equal(event.by.name, 'yan'); assert.equal(event.updatedAt, saved.body.updatedAt);
    assert.equal(JSON.stringify(event).includes('aven-doc-v1'), false, 'events never carry the content');
    yan.close();
    await until(() => zoe.events.filter((e) => e.type === 'presence').at(-1).viewers.length === 1);
    zoe.close();
  });

  test('the stream is for members of this workspace and this document only; guests can watch', async () => {
    assert.equal((await listen(t, 'wes', `${path()}/stream`)).status, 404);
    assert.equal((await listen(t, 'zoe', `${path(otherDoc)}/stream`)).status, 404);
    assert.equal((await fetch(`${t.base}${path()}/stream`)).status, 401);
    const guest = await listen(t, 'xia', `${path()}/stream`); assert.equal(guest.status, 200); guest.close();
  });

  test('people in other workspaces never hear about saves', async () => {
    const outsider = await listen(t, 'wes', `${path(otherDoc, O)}/stream`);
    await t.call('zoe', 'PATCH', path(), { title: 'Plan 2', silent: true, baseUpdatedAt: (await t.call('zoe', 'GET', path())).body.updatedAt });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(outsider.events.some((e) => e.type === 'saved'), false);
    outsider.close();
  });
});
