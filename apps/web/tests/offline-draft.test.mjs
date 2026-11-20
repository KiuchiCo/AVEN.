import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcileDraft } from '../app/workspace/documents/[documentId]/block-merge.ts';
import { draftKey, readDraft, removeDraft, writeDraft } from '../app/workspace/documents/[documentId]/offline-draft.ts';

const p = (id, text) => ({ id, type: 'PARAGRAPH', text });
const memory = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }; };

test('a draft is stored per person, workspace and document, and bad data is ignored', () => {
  const store = memory(); const key = draftKey('u1', 'w1', 'd1');
  assert.notEqual(key, draftKey('u2', 'w1', 'd1'));
  const draft = { title: 'T', content: '{}', base: { updatedAt: 'a', title: 'T0', content: '{}' }, savedAt: 'now' };
  assert.equal(writeDraft(store, key, draft), true);
  assert.deepEqual(readDraft(store, key), draft);
  store.setItem(key, '{"title":1}'); assert.equal(readDraft(store, key), null);
  store.setItem(key, 'not json'); assert.equal(readDraft(store, key), null);
  removeDraft(store, key); assert.equal(readDraft(store, key), null);
  assert.equal(writeDraft({ ...store, setItem: () => { throw new Error('full'); } }, key, draft), false);
});

test('offline edits come back as they were when nobody else saved in the meantime', () => {
  const base = [p('a', 'one'), p('b', 'two')];
  const result = reconcileDraft({ title: 'Plan', blocks: [p('a', 'one!'), p('b', 'two')], base: { updatedAt: '1', title: 'Plan', blocks: base } }, { updatedAt: '1', title: 'Plan', blocks: base });
  assert.deepEqual(result, { title: 'Plan', blocks: [p('a', 'one!'), p('b', 'two')], conflict: false });
});

test('offline edits merge with what others saved while away, block by block', () => {
  const base = [p('a', 'one'), p('b', 'two')];
  const result = reconcileDraft({ title: 'Plan', blocks: [p('a', 'mine'), p('b', 'two')], base: { updatedAt: '1', title: 'Plan', blocks: base } }, { updatedAt: '2', title: 'Plan v2', blocks: [p('a', 'one'), p('b', 'theirs')] });
  assert.equal(result.conflict, false); assert.deepEqual(result.blocks.map((b) => b.text), ['mine', 'theirs']); assert.equal(result.title, 'Plan v2');
});

test('the same block or the title edited on both sides is reported as a conflict', () => {
  const base = [p('a', 'one')];
  assert.equal(reconcileDraft({ title: 'T', blocks: [p('a', 'mine')], base: { updatedAt: '1', title: 'T', blocks: base } }, { updatedAt: '2', title: 'T', blocks: [p('a', 'theirs')] }).conflict, true);
  const renamed = reconcileDraft({ title: 'Mine', blocks: base, base: { updatedAt: '1', title: 'T', blocks: base } }, { updatedAt: '2', title: 'Theirs', blocks: base });
  assert.equal(renamed.conflict, true); assert.equal(renamed.title, 'Mine');
});
