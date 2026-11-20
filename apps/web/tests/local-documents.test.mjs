import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalDocument, isLocalId, readLocalDocument, removeLocalDocument } from '../app/workspace/documents/[documentId]/local-documents.ts';

const memory = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); }, size: () => map.size }; };
const who = { userId: 'u1', workspaceId: 'w1' };

test('a document made offline is kept on the device and read back with its project', () => {
  const store = memory();
  const id = createLocalDocument(store, who, { title: 'Notes', content: 'hello', projectId: 'p1' }, () => 'abcdef123456');
  assert.equal(id, 'local-abcdef123456'); assert.ok(isLocalId(id));
  assert.deepEqual(readLocalDocument(store, who, id), { id, title: 'Notes', content: 'hello', projectId: 'p1' });
  assert.equal(readLocalDocument(store, { userId: 'u2', workspaceId: 'w1' }, id), null, 'only for the person who made it');
  removeLocalDocument(store, who, id);
  assert.equal(readLocalDocument(store, who, id), null); assert.equal(store.size(), 0);
});

test('only temporary ids are treated as local, and a full browser store is reported', () => {
  assert.equal(isLocalId('052b9799-51d9-4705-87f7-e905b3c8e38c'), false); assert.equal(isLocalId('local-x'), false); assert.equal(isLocalId('local-../../etc/passwd'), false);
  const full = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => undefined };
  assert.equal(createLocalDocument(full, who, { title: 't', content: '' }, () => 'abcdef123456'), null);
});
