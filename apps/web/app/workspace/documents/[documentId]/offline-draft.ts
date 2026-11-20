/** Unsaved edits kept on this device, so a lost connection or a closed tab never costs someone their work. */
export type Draft = { title: string; content: string; base: { updatedAt: string; title: string; content: string }; savedAt: string };
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const draftKey = (userId: string, workspaceId: string, documentId: string) => `aven:draft:${userId}:${workspaceId}:${documentId}`;

const text = (value: unknown): value is string => typeof value === 'string';

export function readDraft(store: Store, key: string): Draft | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Draft> | null;
    if (!value || !text(value.title) || !text(value.content) || !text(value.savedAt) || !value.base || !text(value.base.updatedAt) || !text(value.base.title) || !text(value.base.content)) return null;
    return { title: value.title, content: value.content, base: { updatedAt: value.base.updatedAt, title: value.base.title, content: value.base.content }, savedAt: value.savedAt };
  } catch { return null; }
}

/** False when the browser refuses (storage full or blocked); the editor still works, it just can't keep a local copy. */
export function writeDraft(store: Store, key: string, draft: Draft): boolean {
  try { store.setItem(key, JSON.stringify(draft)); return true; } catch { return false; }
}

export function removeDraft(store: Store, key: string) { try { store.removeItem(key); } catch { /* nothing to clean up */ } }
