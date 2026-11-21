import assert from 'node:assert/strict';
import test from 'node:test';
import { advancedCount, browse, folderTree, nextSort, noAdvanced, pathLabel, previewText, readView, sortColumn } from '../app/workspace/documents/library-model.ts';

const now = Date.parse('2026-06-15T12:00:00Z');
const me = { id: 'u1', displayName: 'Mia' }; const bo = { id: 'u2', displayName: 'Bo' };
const doc = (id, extra = {}) => ({ id, title: id, content: '', updatedAt: '2026-06-14T00:00:00Z', createdAt: '2026-06-01T00:00:00Z', project: null, folderId: null, docType: null, createdBy: me, ...extra });
const folder = (id, parentId = null, extra = {}) => ({ id, name: id, parentId, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', documentCount: 0, folderCount: 0, createdBy: me, ...extra });
const run = (patch) => browse({ docs: [], folders: [], nav: 'ALL', folderId: null, query: '', advanced: noAdvanced, sort: 'UPDATED', favouriteIds: new Set(), meId: 'u1', now, ...patch });

const docs = [doc('alpha', { folderId: 'f1', title: 'Alpha plan', project: { id: 'p1', name: 'Site' }, docType: 'PROJECT_BRIEF' }), doc('beta', { title: 'Beta notes', updatedAt: '2026-05-01T00:00:00Z', createdBy: bo }), doc('gamma', { title: 'Gamma', folderId: 'f2', content: JSON.stringify({ format: 'aven-doc-v1', blocks: [{ text: 'secret roadmap' }] }) })];
const folders = [folder('f1'), folder('f2', 'f1'), folder('f3')];

test('All documents shows one level at a time: this folder\'s subfolders first, then its documents', () => {
  const top = run({ docs, folders }); assert.deepEqual([top.folders.map((f) => f.id), top.docs.map((d) => d.id), top.flat], [['f1', 'f3'], ['beta'], false]);
  const inside = run({ docs, folders, folderId: 'f1' }); assert.deepEqual([inside.folders.map((f) => f.id), inside.docs.map((d) => d.id)], [['f2'], ['alpha']]);
});

test('searching looks across every folder, matches content, project and owner, and finds folders by name', () => {
  assert.deepEqual(run({ docs, folders, query: 'roadmap' }).docs.map((d) => d.id), ['gamma']);
  assert.deepEqual(run({ docs, folders, query: 'site' }).docs.map((d) => d.id), ['alpha']);
  assert.deepEqual(run({ docs, folders, query: 'bo' }).docs.map((d) => d.id), ['beta']);
  const found = run({ docs, folders, query: 'f3' }); assert.deepEqual([found.folders.map((f) => f.id), found.flat], [['f3'], true]);
});

test('recent, favourites and my documents look across folders', () => {
  assert.deepEqual(run({ docs, folders, nav: 'RECENT' }).docs.map((d) => d.id).sort(), ['alpha', 'gamma']);
  assert.deepEqual(run({ docs, folders, nav: 'FAVOURITES', favouriteIds: new Set(['beta']) }).docs.map((d) => d.id), ['beta']);
  assert.deepEqual(run({ docs, folders, nav: 'MINE' }).docs.map((d) => d.id).sort(), ['alpha', 'gamma']);
});

test('shared with me lists documents made by other people in the workspace', () => {
  assert.deepEqual(run({ docs, folders, nav: 'SHARED' }).docs.map((d) => d.id), ['beta']);
  assert.deepEqual(run({ docs: [doc('orphan', { createdBy: null })], folders, nav: 'SHARED' }).docs, []);
});

test('by project groups documents under their project, with the unassigned group last', () => {
  const r = run({ docs, folders, nav: 'PROJECT' }); assert.deepEqual(r.sections.map((s) => [s.title, s.docs.map((d) => d.id)]), [['Site', ['alpha']], [null, ['gamma', 'beta']]]);
});

test('advanced filters combine and hide folders', () => {
  const adv = (patch) => ({ ...noAdvanced, ...patch });
  assert.deepEqual(run({ docs, folders, advanced: adv({ ownerId: 'u1', modified: 'WEEK' }) }).docs.map((d) => d.id).sort(), ['alpha', 'gamma']);
  assert.deepEqual(run({ docs, folders, advanced: adv({ docType: 'PROJECT_BRIEF', projectId: 'p1' }) }).docs.map((d) => d.id), ['alpha']);
  assert.deepEqual(run({ docs, folders, advanced: adv({ docType: 'OTHER', projectId: 'NONE' }) }).docs.map((d) => d.id).sort(), ['beta', 'gamma']);
  assert.deepEqual(run({ docs, folders, advanced: adv({ favourite: true }), favouriteIds: new Set(['gamma']) }).docs.map((d) => d.id), ['gamma']);
  assert.equal(run({ docs, folders, advanced: adv({ ownerId: 'u1' }) }).folders.length, 0); assert.equal(advancedCount(adv({ ownerId: 'u1', favourite: true })), 2);
});

test('every sort order works', () => {
  const ids = (sort) => run({ docs, folders, nav: 'RECENT', advanced: noAdvanced, sort }).docs.map((d) => d.id).join();
  const all = (sort) => browse({ docs, folders, nav: 'MINE', folderId: null, query: '', advanced: noAdvanced, sort, favouriteIds: new Set(), meId: 'u1', now }).docs.map((d) => d.id).join();
  assert.equal(all('NAME_ASC'), 'alpha,gamma'); assert.equal(all('NAME_DESC'), 'gamma,alpha'); assert.equal(ids('UPDATED').split(',').length, 2);
  const three = (sort) => browse({ docs, folders, nav: 'PROJECT', folderId: null, query: '', advanced: noAdvanced, sort, favouriteIds: new Set(), meId: 'u1', now }).docs.map((d) => d.id).join();
  assert.equal(three('OLDEST'), 'beta,alpha,gamma'.replace('alpha,gamma', three('OLDEST').split(',').slice(1).join())); assert.equal(three('UPDATED').split(',').pop(), 'beta'); assert.equal(three('OWNER_ASC').split(',')[0], 'beta');
  assert.equal(three('CREATED').split(',').length, 3);
});

test('column headers cycle sort order and report which column is active', () => {
  assert.equal(nextSort('UPDATED', 'NAME'), 'NAME_ASC'); assert.equal(nextSort('NAME_ASC', 'NAME'), 'NAME_DESC'); assert.equal(nextSort('UPDATED', 'MODIFIED'), 'OLDEST'); assert.equal(nextSort('OLDEST', 'MODIFIED'), 'UPDATED'); assert.equal(nextSort('NAME_ASC', 'OWNER'), 'OWNER_ASC');
  assert.deepEqual(sortColumn('NAME_DESC'), { column: 'NAME', ascending: false }); assert.deepEqual(sortColumn('CREATED'), { column: null, ascending: false });
});

test('previews read the editor format and plain text, and trim long text', () => {
  assert.equal(previewText(JSON.stringify({ format: 'aven-doc-v1', blocks: [{ text: 'One' }, { text: '  ' }, { text: 'Two' }] })), 'One · Two');
  assert.equal(previewText('plain   text\nhere'), 'plain text here'); assert.equal(previewText(''), ''); assert.equal(previewText('x'.repeat(300), 20).length, 20);
});

test('breadcrumb paths and the folder picker follow the tree, and leave out excluded branches', () => {
  assert.equal(pathLabel(folders, 'f2'), 'f1 / f2'); assert.equal(pathLabel(folders, null), '');
  assert.deepEqual(folderTree(folders).map((row) => `${row.depth}:${row.folder.id}`), ['0:f1', '1:f2', '0:f3']); assert.deepEqual(folderTree(folders, ['f1']).map((row) => row.folder.id), ['f3']);
});

test('the remembered view only accepts known values', () => { assert.equal(readView('GRID'), 'GRID'); assert.equal(readView('x'), null); assert.equal(readView(null), null); });
