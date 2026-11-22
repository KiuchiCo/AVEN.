import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('performance: lists stay a bounded size', { skip }, () => {
  let t; let W; let ws; let Service;
  before(async () => {
    t = await boot(); await t.user('lia'); W = await t.workspace('lia'); ws = `/workspaces/${W.id}`;
    ({ ProductivityService: Service } = await import('../../dist/productivity/productivity.service.js'));
  });
  after(async () => { await t?.close(); });

  test('the document list sends a short preview, not every document in full, and one document still opens in full', async () => {
    const long = JSON.stringify({ format: 'aven-doc-v1', blocks: Array.from({ length: 50 }, (_, i) => ({ id: `b${i}`, type: 'PARAGRAPH', text: `Paragraph ${i} ${'word '.repeat(60)}` })) });
    const doc = (await t.call('lia', 'POST', `${ws}/documents`, { title: 'Long one', content: long })).body;
    const listed = (await t.call('lia', 'GET', `${ws}/documents`)).body.find((row) => row.id === doc.id);
    const preview = JSON.parse(listed.content);
    assert.equal(preview.format, 'aven-doc-v1'); assert.ok(preview.blocks[0].text.startsWith('Paragraph 0'));
    assert.ok(listed.content.length < 1000, `the list carries ${listed.content.length} characters, not ${long.length}`);
    assert.equal((await t.call('lia', 'GET', `${ws}/documents/${doc.id}`)).body.content, long, 'opening it gives all of it');
  });

  test('a list longer than its limit is cut and says so in a header, instead of sending everything', async () => {
    const tasksLimit = Service.taskListLimit; const docsLimit = Service.documentListLimit;
    try {
      Service.taskListLimit = 2; Service.documentListLimit = 1;
      for (let i = 0; i < 3; i += 1) await t.call('lia', 'POST', `${ws}/tasks`, { title: `Task ${i}` });
      const tasks = await fetch(`${t.base}${ws}/tasks`, { headers: t.headers('lia') });
      assert.equal((await tasks.json()).length, 2); assert.equal(tasks.headers.get('x-truncated'), 'true'); assert.equal(tasks.headers.get('x-row-count'), '2');
      await t.call('lia', 'POST', `${ws}/documents`, { title: 'Second', content: '' });
      const docs = await fetch(`${t.base}${ws}/documents`, { headers: t.headers('lia') });
      assert.equal((await docs.json()).length, 1); assert.equal(docs.headers.get('x-truncated'), 'true');
      Service.taskListLimit = 100;
      const all = await fetch(`${t.base}${ws}/tasks`, { headers: t.headers('lia') });
      assert.equal((await all.json()).length, 3); assert.equal(all.headers.get('x-truncated'), null);
    } finally { Service.taskListLimit = tasksLimit; Service.documentListLimit = docsLimit; }
  });
});
