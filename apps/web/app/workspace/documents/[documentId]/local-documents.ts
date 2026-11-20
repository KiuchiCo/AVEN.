// A document made while the connection is down. It lives on this device as a draft under a temporary id ("local-…") and is created on the
// server, with the text it has by then, as soon as the connection is back; the page then moves to the real address.
import { draftKey, readDraft, writeDraft, type Draft } from './offline-draft.ts';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const isLocalId = (id: string) => /^local-[\w-]{8,64}$/.test(id);
const metaKey = (userId: string, workspaceId: string, id: string) => `aven:newdoc:${userId}:${workspaceId}:${id}`;

export type LocalDocument = { id: string; title: string; content: string; projectId: string | null };

/** Keeps a new document on this device. Returns its temporary id, or null when the browser refuses to store it. */
export function createLocalDocument(store: Store, who: { userId: string; workspaceId: string }, input: { title: string; content: string; projectId?: string | null }, newId: () => string): string | null {
  const id = `local-${newId()}`;
  const draft: Draft = { title: input.title, content: input.content, base: { updatedAt: '', title: '', content: '' }, savedAt: new Date().toISOString() };
  if (!writeDraft(store, draftKey(who.userId, who.workspaceId, id), draft)) return null;
  try { store.setItem(metaKey(who.userId, who.workspaceId, id), JSON.stringify({ projectId: input.projectId ?? null })); } catch { /* the document is kept; it just won't be filed under a project */ }
  return id;
}

export function readLocalDocument(store: Store, who: { userId: string; workspaceId: string }, id: string): LocalDocument | null {
  if (!isLocalId(id)) return null;
  const draft = readDraft(store, draftKey(who.userId, who.workspaceId, id));
  if (!draft) return null;
  let projectId: string | null = null;
  try { const meta = JSON.parse(store.getItem(metaKey(who.userId, who.workspaceId, id)) ?? 'null') as { projectId?: unknown } | null; if (typeof meta?.projectId === 'string') projectId = meta.projectId; } catch { /* no project */ }
  return { id, title: draft.title, content: draft.content, projectId };
}

export function removeLocalDocument(store: Store, who: { userId: string; workspaceId: string }, id: string) {
  try { store.removeItem(draftKey(who.userId, who.workspaceId, id)); store.removeItem(metaKey(who.userId, who.workspaceId, id)); } catch { /* nothing to clean up */ }
}
