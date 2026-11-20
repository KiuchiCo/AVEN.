import { Injectable } from '@nestjs/common';

export type Viewer = { id: string; name: string };
/** Who has the document open, and the block each person last put their cursor in (null when none). */
export type PresentViewer = Viewer & { blockId: string | null };
export type DocumentEvent =
  | { type: 'presence'; viewers: PresentViewer[] }
  | { type: 'saved'; updatedAt: string; by: Viewer };

type Listener = { viewer: Viewer; send: (event: DocumentEvent) => void };

/**
 * Tells people who have a document open when someone saves it and who else is looking at it. In memory, so it reaches
 * clients connected to this API process only. shortcut: with several API instances, back it with Postgres LISTEN/NOTIFY or Redis.
 * Events carry no content: a client that hears "saved" fetches the document through the normal, permission-checked route.
 */
@Injectable()
export class DocumentEvents {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly open = new Map<string, number>();
  private readonly focus = new Map<string, Map<string, string>>();

  /** Caps how many live document connections one person can hold. Returns a release function, or null when over the cap. */
  acquire(userId: string, max = 10): (() => void) | null {
    const count = this.open.get(userId) ?? 0;
    if (count >= max) return null;
    this.open.set(userId, count + 1);
    let released = false;
    return () => { if (released) return; released = true; const left = (this.open.get(userId) ?? 1) - 1; if (left <= 0) this.open.delete(userId); else this.open.set(userId, left); };
  }

  viewers(documentId: string): PresentViewer[] {
    const seen = new Map<string, PresentViewer>();
    for (const { viewer } of this.listeners.get(documentId) ?? []) seen.set(viewer.id, { ...viewer, blockId: this.focus.get(documentId)?.get(viewer.id) ?? null });
    return [...seen.values()];
  }

  /** Records which block a viewer is in. Ignored unless that person has the document open, so it can't be used to invent presence. */
  setFocus(documentId: string, userId: string, blockId: string | null) {
    if (![...(this.listeners.get(documentId) ?? [])].some((listener) => listener.viewer.id === userId)) return false;
    const map = this.focus.get(documentId) ?? new Map<string, string>();
    if ((map.get(userId) ?? null) === blockId) return true;
    if (blockId) map.set(userId, blockId); else map.delete(userId);
    this.focus.set(documentId, map);
    this.publish(documentId, { type: 'presence', viewers: this.viewers(documentId) });
    return true;
  }

  subscribe(documentId: string, viewer: Viewer, send: (event: DocumentEvent) => void): () => void {
    const listener: Listener = { viewer, send };
    const set = this.listeners.get(documentId) ?? new Set();
    set.add(listener); this.listeners.set(documentId, set);
    this.publish(documentId, { type: 'presence', viewers: this.viewers(documentId) });
    return () => {
      set.delete(listener);
      if (![...set].some((other) => other.viewer.id === viewer.id)) this.focus.get(documentId)?.delete(viewer.id);
      if (!set.size) { this.listeners.delete(documentId); this.focus.delete(documentId); }
      else this.publish(documentId, { type: 'presence', viewers: this.viewers(documentId) });
    };
  }

  publish(documentId: string, event: DocumentEvent) {
    for (const listener of [...(this.listeners.get(documentId) ?? [])]) {
      try { listener.send(event); } catch { /* one broken connection must not stop the others */ }
    }
  }
}
