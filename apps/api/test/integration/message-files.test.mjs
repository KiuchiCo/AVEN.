import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('files shared in messages', { skip }, () => {
  let t; let W; let O; let channel; let file;
  before(async () => {
    t = await boot();
    for (const name of ['kai', 'lou', 'mia']) await t.user(name);
    W = await t.workspace('kai'); await t.member(W.id, 'lou', 'MEMBER'); O = await t.workspace('mia');
    channel = (await t.call('kai', 'POST', `/workspaces/${W.id}/channels`, { name: 'general' })).body;
    file = (await t.upload('kai', W.id, Buffer.from('hello'), 'name=brief.txt', 'text/plain')).body;
  });
  after(async () => { await t?.close(); });
  const send = (who, body) => t.call(who, 'POST', `/workspaces/${W.id}/channels/${channel.id}/messages`, body);

  test('a file can be shared with or without text, and shows in the thread', async () => {
    const withText = await send('kai', { body: 'see attached', fileIds: [file.id] });
    assert.equal(withText.status, 201, JSON.stringify(withText.body));
    assert.deepEqual(withText.body.files.map((f) => f.name), ['brief.txt']);
    const fileOnly = await send('lou', { fileIds: [file.id] });
    assert.equal(fileOnly.status, 201); assert.equal(fileOnly.body.body, '');
    const page = (await t.call('lou', 'GET', `/workspaces/${W.id}/channels/${channel.id}/messages`)).body;
    assert.equal(page.messages.length, 2); assert.equal(page.messages[0].files[0].sizeBytes, 5);
  });

  test('empty messages, foreign files and too many files are refused', async () => {
    assert.equal((await send('kai', { body: ' ' })).status, 400);
    const foreign = (await t.upload('mia', O.id, Buffer.from('x'), 'name=other.txt', 'text/plain')).body;
    assert.equal((await send('kai', { body: 'x', fileIds: [foreign.id] })).status, 400);
    assert.equal((await send('kai', { body: 'x', fileIds: Array(6).fill(file.id) })).status, 400);
  });

  test('deleting a message removes its files from view, and a deleted file disappears from messages', async () => {
    const m = (await send('kai', { body: 'bye', fileIds: [file.id] })).body;
    await t.call('kai', 'DELETE', `/workspaces/${W.id}/channels/${channel.id}/messages/${m.id}`);
    const page = (await t.call('kai', 'GET', `/workspaces/${W.id}/channels/${channel.id}/messages`)).body;
    assert.deepEqual(page.messages.find((x) => x.id === m.id).files, []);
    const second = (await t.upload('kai', W.id, Buffer.from('two'), 'name=two.txt', 'text/plain')).body;
    const m2 = (await send('kai', { body: 'again', fileIds: [second.id] })).body;
    await t.call('kai', 'DELETE', `/workspaces/${W.id}/files/${second.id}`);
    const after = (await t.call('kai', 'GET', `/workspaces/${W.id}/channels/${channel.id}/messages`)).body;
    assert.deepEqual(after.messages.find((x) => x.id === m2.id).files, []);
  });
});
