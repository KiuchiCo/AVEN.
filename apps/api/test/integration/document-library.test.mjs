import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

describe('document folders, owners, duplicates and bulk actions', { skip }, () => {
  let t; let W; let ws; let own; let mem;
  before(async () => {
    t = await boot(); own = await t.user('own'); mem = await t.user('mem'); await t.user('gst'); await t.user('out');
    W = await t.workspace('own'); ws = `/workspaces/${W.id}`;
    await t.member(W.id, 'mem', 'MEMBER'); await t.member(W.id, 'gst', 'GUEST');
  });
  after(async () => { await t?.close(); });
  const doc = async (who, body) => (await t.call(who, 'POST', `${ws}/documents`, { title: 'D', content: '', ...body })).body;

  test('a document records who made it and its type, and can start inside a folder', async () => {
    const folder = (await t.call('own', 'POST', `${ws}/documents/folders`, { name: 'Research' })).body;
    const made = await t.call('mem', 'POST', `${ws}/documents`, { title: 'Notes', content: '', docType: 'MEETING_NOTES', folderId: folder.id });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal(made.body.createdBy.displayName, 'mem'); assert.equal(made.body.docType, 'MEETING_NOTES'); assert.equal(made.body.folderId, folder.id);
    const listed = (await t.call('own', 'GET', `${ws}/documents`)).body.find((d) => d.id === made.body.id);
    assert.equal(listed.createdBy.id, mem.id); assert.equal(listed.docType, 'MEETING_NOTES');
    assert.equal((await t.call('own', 'POST', `${ws}/documents`, { title: 'x', content: '', docType: 'NOPE' })).status, 400);
    assert.equal((await t.call('own', 'POST', `${ws}/documents`, { title: 'x', content: '', folderId: '00000000-0000-4000-8000-000000000000' })).status, 404);
  });

  test('folders nest, refuse duplicates, cycles and guests, and list their counts', async () => {
    const a = (await t.call('own', 'POST', `${ws}/documents/folders`, { name: 'Website' })).body;
    const b = (await t.call('own', 'POST', `${ws}/documents/folders`, { name: 'Design', parentId: a.id })).body;
    assert.equal((await t.call('own', 'POST', `${ws}/documents/folders`, { name: 'design', parentId: a.id })).status, 409, 'names are unique per level, ignoring case');
    assert.equal((await t.call('own', 'POST', `${ws}/documents/folders`, { name: 'Design' })).status, 201, 'the same name is fine at another level');
    assert.equal((await t.call('own', 'POST', `${ws}/documents/folders`, { name: 'a/b' })).status, 400);
    assert.equal((await t.call('gst', 'POST', `${ws}/documents/folders`, { name: 'Guest' })).status, 403);
    assert.equal((await t.call('out', 'GET', `${ws}/documents/folders`)).status, 404);
    assert.equal((await t.call('own', 'PATCH', `${ws}/documents/folders/${a.id}`, { parentId: b.id })).status, 400, 'a folder cannot move into its own subfolder');
    assert.equal((await t.call('mem', 'PATCH', `${ws}/documents/folders/${b.id}`, { name: 'Visuals' })).status, 200);
    await doc('own', { folderId: b.id });
    const rows = (await t.call('own', 'GET', `${ws}/documents/folders`)).body;
    assert.equal(rows.find((f) => f.id === a.id).folderCount, 1); assert.equal(rows.find((f) => f.id === b.id).documentCount, 1); assert.equal(rows.find((f) => f.id === b.id).name, 'Visuals');
    let parent = b;
    for (let i = 0; i < 7; i += 1) { const r = await t.call('own', 'POST', `${ws}/documents/folders`, { name: `L${i}`, parentId: parent.id }); if (r.status !== 201) { assert.equal(i >= 5, true); assert.equal(r.status, 400); break; } parent = r.body; }
  });

  test('moving documents keeps their last-modified date, and a move to the top level works', async () => {
    const f = (await t.call('own', 'POST', `${ws}/documents/folders`, { name: 'Moves' })).body;
    const d1 = await doc('own', { title: 'One' }); const d2 = await doc('own', { title: 'Two' });
    const moved = await t.call('mem', 'POST', `${ws}/documents/bulk`, { action: 'move', documentIds: [d1.id, d2.id], folderId: f.id });
    assert.deepEqual([moved.status, moved.body.count], [201, 2], JSON.stringify(moved.body));
    const after = (await t.call('own', 'GET', `${ws}/documents`)).body.filter((d) => [d1.id, d2.id].includes(d.id));
    assert.ok(after.every((d) => d.folderId === f.id)); assert.equal(after.find((d) => d.id === d1.id).updatedAt, d1.updatedAt);
    assert.equal((await t.call('own', 'POST', `${ws}/documents/bulk`, { action: 'move', documentIds: [d1.id], folderId: null })).status, 201);
    assert.equal((await t.call('own', 'POST', `${ws}/documents/bulk`, { action: 'move', documentIds: [d1.id], folderId: '00000000-0000-4000-8000-000000000000' })).status, 404);
    assert.equal((await t.call('own', 'POST', `${ws}/documents/bulk`, { action: 'move', documentIds: [] , folderId: null })).status, 400);
    assert.equal((await t.call('gst', 'POST', `${ws}/documents/bulk`, { action: 'move', documentIds: [d1.id], folderId: null })).status, 403);
  });

  test('deleting a folder keeps what was inside by moving it up, and refuses a name clash', async () => {
    const top = (await t.call('own', 'POST', `${ws}/documents/folders`, { name: 'Top' })).body;
    const mid = (await t.call('own', 'POST', `${ws}/documents/folders`, { name: 'Mid', parentId: top.id })).body;
    const leaf = (await t.call('own', 'POST', `${ws}/documents/folders`, { name: 'Leaf', parentId: mid.id })).body;
    const d = await doc('own', { folderId: mid.id });
    const gone = await t.call('own', 'DELETE', `${ws}/documents/folders/${mid.id}`);
    assert.deepEqual([gone.status, gone.body.documents, gone.body.folders], [200, 1, 1]);
    assert.equal((await t.call('own', 'GET', `${ws}/documents/${d.id}`)).body.folderId, top.id);
    assert.equal((await t.call('own', 'GET', `${ws}/documents/folders`)).body.find((f) => f.id === leaf.id).parentId, top.id);
    const x = (await t.call('own', 'POST', `${ws}/documents/folders`, { name: 'Same', parentId: top.id })).body; const y = (await t.call('own', 'POST', `${ws}/documents/folders`, { name: 'Wrap', parentId: top.id })).body;
    await t.call('own', 'POST', `${ws}/documents/folders`, { name: 'same', parentId: y.id });
    assert.equal((await t.call('own', 'DELETE', `${ws}/documents/folders/${y.id}`)).status, 409); void x;
  });

  test('a duplicate keeps content, project and folder under a new id and title', async () => {
    const p = (await t.call('own', 'POST', `${ws}/projects`, { name: 'Proj' })).body; const f = (await t.call('own', 'POST', `${ws}/documents/folders`, { name: 'Dup' })).body;
    const src = await doc('own', { title: 'Source', content: 'hello', projectId: p.id, folderId: f.id, docType: 'PROJECT_BRIEF' });
    const copy = await t.call('mem', 'POST', `${ws}/documents/${src.id}/duplicate`);
    assert.equal(copy.status, 201); assert.notEqual(copy.body.id, src.id);
    assert.deepEqual([copy.body.title, copy.body.content, copy.body.projectId, copy.body.folderId, copy.body.docType, copy.body.createdBy.displayName], ['Source copy', 'hello', p.id, f.id, 'PROJECT_BRIEF', 'mem']);
    assert.equal((await t.call('gst', 'POST', `${ws}/documents/${src.id}/duplicate`)).status, 403);
  });

  test('bulk delete removes only the chosen documents and is limited to this workspace', async () => {
    const a = await doc('own', { title: 'A' }); const b = await doc('own', { title: 'B' }); const keep = await doc('own', { title: 'Keep' });
    const other = await t.workspace('mem', 'Other'); const foreign = (await t.call('mem', 'POST', `/workspaces/${other.id}/documents`, { title: 'F', content: '' })).body;
    assert.equal((await t.call('own', 'POST', `${ws}/documents/bulk`, { action: 'delete', documentIds: [a.id, foreign.id] })).status, 404, 'another workspace\'s document cannot be touched');
    const r = await t.call('own', 'POST', `${ws}/documents/bulk`, { action: 'delete', documentIds: [a.id, b.id] });
    assert.deepEqual([r.status, r.body.count], [201, 2]);
    const ids = (await t.call('own', 'GET', `${ws}/documents`)).body.map((d) => d.id);
    assert.equal(ids.includes(a.id) || ids.includes(b.id), false); assert.equal(ids.includes(keep.id), true);
    assert.equal((await t.call('own', 'POST', `${ws}/documents/bulk`, { action: 'explode', documentIds: [keep.id] })).status, 400);
  });
});
