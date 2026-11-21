/** Types and pure rules for browsing documents and folders. No React, no network, so every rule here is tested. */
import type { IconName } from '../ui';

export type DocRecord = {
  id: string; title: string; content: string; updatedAt: string; createdAt: string; project: { id: string; name: string } | null;
  folderId: string | null; docType: string | null; createdBy: { id: string; displayName: string } | null;
};
export type FolderRecord = { id: string; name: string; parentId: string | null; createdAt: string; updatedAt: string; documentCount: number; folderCount: number; createdBy: { id: string; displayName: string } };

export type NavFilter = 'ALL' | 'RECENT' | 'FAVOURITES' | 'PROJECT' | 'MINE' | 'SHARED';
export type SortKey = 'UPDATED' | 'CREATED' | 'NAME_ASC' | 'NAME_DESC' | 'OLDEST' | 'OWNER_ASC' | 'OWNER_DESC';
export type Modified = 'ANY' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
export type Advanced = { projectId: string; ownerId: string; modified: Modified; docType: string; favourite: boolean };
export const noAdvanced: Advanced = { projectId: '', ownerId: '', modified: 'ANY', docType: '', favourite: false };
export const advancedCount = (filters: Advanced) => [filters.projectId, filters.ownerId, filters.modified !== 'ANY', filters.docType, filters.favourite].filter(Boolean).length;

/** The starting points offered when creating a document. `template` names an entry in templates.ts (null starts empty). */
export const documentKinds: { type: string; template: string | null; icon: IconName }[] = [
  { type: 'BLANK', template: null, icon: 'doc' }, { type: 'MEETING_NOTES', template: 'meeting-notes', icon: 'calendar' }, { type: 'PROJECT_BRIEF', template: 'project-brief', icon: 'target' },
  { type: 'TASK_PLAN', template: 'task-plan', icon: 'checkCircle' }, { type: 'RESEARCH_NOTES', template: 'research-notes', icon: 'search' }, { type: 'DECISION_LOG', template: 'decision-record', icon: 'flag' },
  { type: 'WEEKLY_PLAN', template: 'weekly-plan', icon: 'clock' }, { type: 'STUDY_NOTES', template: 'study-notes', icon: 'sparkle' },
];
export const kindIcon = (type: string | null): IconName => documentKinds.find((kind) => kind.type === type)?.icon ?? 'doc';

/** The first lines of what a document says, for previews. Reads the editor's format and older plain-text notes. */
export function previewText(content: string, max = 220): string {
  let text = content;
  try {
    const value = JSON.parse(content) as { format?: string; blocks?: { text?: string }[] };
    if (value.format === 'aven-doc-v1' && Array.isArray(value.blocks)) text = value.blocks.map((block) => block.text ?? '').filter((line) => line.trim()).join(' · ');
  } catch { /* plain text */ }
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Folders from the top level down to this one (inclusive), for breadcrumbs. */
export function pathTo(folders: FolderRecord[], id: string | null): FolderRecord[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: FolderRecord[] = []; const seen = new Set<string>();
  let current = id ? byId.get(id) : undefined;
  while (current && !seen.has(current.id)) { seen.add(current.id); path.unshift(current); current = current.parentId ? byId.get(current.parentId) : undefined; }
  return path;
}
export const pathLabel = (folders: FolderRecord[], id: string | null) => pathTo(folders, id).map((folder) => folder.name).join(' / ');

/** A folder with its depth, in tree order, for pickers. Folders in `exclude` (and everything inside them) are left out. */
export function folderTree(folders: FolderRecord[], exclude: string[] = []): { folder: FolderRecord; depth: number }[] {
  const out: { folder: FolderRecord; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of folders.filter((row) => row.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name))) {
      if (exclude.includes(folder.id)) continue;
      out.push({ folder, depth }); walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

const DAY = 86_400_000;
const windows: Record<Modified, number> = { ANY: Infinity, DAY: DAY, WEEK: 7 * DAY, MONTH: 30 * DAY, YEAR: 365 * DAY };
const owner = (doc: { createdBy: { displayName: string } | null }) => doc.createdBy?.displayName ?? '';

export type BrowseInput = { docs: DocRecord[]; folders: FolderRecord[]; nav: NavFilter; folderId: string | null; query: string; advanced: Advanced; sort: SortKey; favouriteIds: Set<string>; meId: string; now: number };
export type BrowseResult = { folders: FolderRecord[]; docs: DocRecord[]; flat: boolean; sections: { key: string; title: string | null; docs: DocRecord[] }[] };

function compare<T extends { name: string; updatedAt: string; createdAt: string; owner: string }>(sort: SortKey) {
  return (a: T, b: T) => sort === 'NAME_ASC' ? a.name.localeCompare(b.name) : sort === 'NAME_DESC' ? b.name.localeCompare(a.name)
    : sort === 'OLDEST' ? a.updatedAt.localeCompare(b.updatedAt) || a.name.localeCompare(b.name)
      : sort === 'CREATED' ? b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name)
        : sort === 'OWNER_ASC' ? a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name) : sort === 'OWNER_DESC' ? b.owner.localeCompare(a.owner) || a.name.localeCompare(b.name)
          : b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name);
}

/**
 * What to show. In "All documents" without a search or advanced filter you see one folder level at a time (folders, then
 * documents). Searching, the other tabs and the advanced filters look across every folder and show documents only,
 * because a filter that stopped at the folder you happen to be in would hide what you asked for.
 */
export function browse(input: BrowseInput): BrowseResult {
  const { docs, folders, nav, folderId, advanced, sort, favouriteIds, meId, now } = input;
  const query = input.query.trim().toLocaleLowerCase();
  const filtering = Boolean(query) || advancedCount(advanced) > 0;
  const flat = nav !== 'ALL' || filtering;
  let pool = docs;
  if (!flat) pool = docs.filter((doc) => doc.folderId === folderId);
  if (nav === 'RECENT') pool = pool.filter((doc) => now - Date.parse(doc.updatedAt) <= 7 * DAY);
  if (nav === 'FAVOURITES') pool = pool.filter((doc) => favouriteIds.has(doc.id));
  if (nav === 'MINE') pool = pool.filter((doc) => doc.createdBy?.id === meId);
  if (nav === 'SHARED') pool = pool.filter((doc) => doc.createdBy !== null && doc.createdBy.id !== meId); // made by someone else in this workspace
  if (query) pool = pool.filter((doc) => `${doc.title} ${doc.project?.name ?? ''} ${owner(doc)} ${previewText(doc.content, 400)}`.toLocaleLowerCase().includes(query));
  if (advanced.projectId) pool = pool.filter((doc) => advanced.projectId === 'NONE' ? !doc.project : doc.project?.id === advanced.projectId);
  if (advanced.ownerId) pool = pool.filter((doc) => doc.createdBy?.id === advanced.ownerId);
  if (advanced.modified !== 'ANY') pool = pool.filter((doc) => now - Date.parse(doc.updatedAt) <= windows[advanced.modified]);
  if (advanced.docType) pool = pool.filter((doc) => advanced.docType === 'OTHER' ? !doc.docType : doc.docType === advanced.docType);
  if (advanced.favourite) pool = pool.filter((doc) => favouriteIds.has(doc.id));
  const sortedDocs = [...pool].sort((a, b) => compare<{ name: string; updatedAt: string; createdAt: string; owner: string }>(sort)({ name: a.title, updatedAt: a.updatedAt, createdAt: a.createdAt, owner: owner(a) }, { name: b.title, updatedAt: b.updatedAt, createdAt: b.createdAt, owner: owner(b) }));
  let shownFolders: FolderRecord[] = [];
  if (nav === 'ALL' && advancedCount(advanced) === 0) {
    shownFolders = (query ? folders.filter((folder) => folder.name.toLocaleLowerCase().includes(query)) : folders.filter((folder) => folder.parentId === folderId))
      .sort((a, b) => compare<{ name: string; updatedAt: string; createdAt: string; owner: string }>(sort)({ name: a.name, updatedAt: a.updatedAt, createdAt: a.createdAt, owner: a.createdBy.displayName }, { name: b.name, updatedAt: b.updatedAt, createdAt: b.createdAt, owner: b.createdBy.displayName }));
  }
  const sections: BrowseResult['sections'] = nav === 'PROJECT'
    ? [...new Set(sortedDocs.map((doc) => doc.project?.id ?? ''))].map((id) => ({ key: id || 'none', title: id ? sortedDocs.find((doc) => doc.project?.id === id)!.project!.name : null, docs: sortedDocs.filter((doc) => (doc.project?.id ?? '') === id) })).sort((a, b) => (a.title === null ? 1 : b.title === null ? -1 : a.title.localeCompare(b.title)))
    : [{ key: 'all', title: null, docs: sortedDocs }];
  return { folders: shownFolders, docs: sortedDocs, flat, sections };
}

/** Header click on a sortable column: the first click sorts ascending (newest first for dates), the next reverses it. */
export function nextSort(current: SortKey, column: 'NAME' | 'MODIFIED' | 'OWNER'): SortKey {
  if (column === 'NAME') return current === 'NAME_ASC' ? 'NAME_DESC' : 'NAME_ASC';
  if (column === 'OWNER') return current === 'OWNER_ASC' ? 'OWNER_DESC' : 'OWNER_ASC';
  return current === 'UPDATED' ? 'OLDEST' : 'UPDATED';
}
export const sortColumn = (sort: SortKey): { column: 'NAME' | 'MODIFIED' | 'OWNER' | null; ascending: boolean } =>
  sort === 'NAME_ASC' ? { column: 'NAME', ascending: true } : sort === 'NAME_DESC' ? { column: 'NAME', ascending: false } : sort === 'OWNER_ASC' ? { column: 'OWNER', ascending: true } : sort === 'OWNER_DESC' ? { column: 'OWNER', ascending: false }
    : sort === 'UPDATED' ? { column: 'MODIFIED', ascending: false } : sort === 'OLDEST' ? { column: 'MODIFIED', ascending: true } : { column: null, ascending: false };

export const VIEW_KEY = (workspaceId: string) => `aven.documents.view.${workspaceId}`;
export const readView = (raw: string | null): 'LIST' | 'GRID' | null => (raw === 'LIST' || raw === 'GRID' ? raw : null);
