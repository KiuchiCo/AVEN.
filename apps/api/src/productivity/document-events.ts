import { Injectable } from '@nestjs/common';

export type Viewer = { id: string; name: string };
export type DocumentEvent =
  | { type: 'presence'; viewers: Viewer[] }
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

  /** Caps how many live document connections one person can hold. Returns a release function, or null when over the cap. */
  acquire(userId: string, max = 10): (() => void) | null {
    const count = this.open.get(userId) ?? 0;
    if (count >= max) return null;
    this.open.set(userId, count + 1);
    let released = false;
    return () => { if (released) return; released = true; const left = (this.open.get(userId) ?? 1) - 1; if (left <= 0) this.open.delete(userId); else this.open.set(userId, left); };
  }

  viewers(documentId: string): Viewer[] {
    const seen = new Map<string, Viewer>();
    for (const { viewer } of this.listeners.get(documentId) ?? []) seen.set(viewer.id, viewer);
    return [...seen.values()];
  }

  subscribe(documentId: string, viewer: Viewer, send: (event: DocumentEvent) => void): () => void {
    const listener: Listener = { viewer, send };
    const set = this.listeners.get(documentId) ?? new Set();
    set.add(listener); this.listeners.set(documentId, set);
    this.publish(documentId, { type: 'presence', viewers: this.viewers(documentId) });
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(documentId);
      else this.publish(documentId, { type: 'presence', viewers: this.viewers(documentId) });
    };
  }

  publish(documentId: string, event: DocumentEvent) {
    for (const listener of [...(this.listeners.get(documentId) ?? [])]) {
      try { listener.send(event); } catch { /* one broken connection must not stop the others */ }
    }
  }
}
