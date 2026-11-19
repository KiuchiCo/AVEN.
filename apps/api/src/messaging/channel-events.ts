import { Injectable } from '@nestjs/common';

export type ChannelEvent =
  | { type: 'message'; channelId: string; message: unknown }
  | { type: 'message_updated'; channelId: string; message: unknown }
  | { type: 'message_deleted'; channelId: string; id: string }
  | { type: 'channel'; channel: unknown };

/**
 * Pushes events to people who have a workspace open. It lives in memory, so it reaches clients connected to this
 * API process only. shortcut: with several API instances, replace this with Postgres LISTEN/NOTIFY or Redis pub/sub.
 */
@Injectable()
export class ChannelEvents {
  private readonly listeners = new Map<string, Set<(event: ChannelEvent) => void>>();

  private readonly open = new Map<string, number>();

  /** Limits how many live connections one person can hold open, so a runaway client can't exhaust the server. Returns a release function, or null when over the limit. */
  acquire(userId: string, max = 5): (() => void) | null {
    const count = this.open.get(userId) ?? 0;
    if (count >= max) return null;
    this.open.set(userId, count + 1);
    let released = false;
    return () => { if (released) return; released = true; const left = (this.open.get(userId) ?? 1) - 1; if (left <= 0) this.open.delete(userId); else this.open.set(userId, left); };
  }

  subscribe(workspaceId: string, listener: (event: ChannelEvent) => void): () => void {
    const set = this.listeners.get(workspaceId) ?? new Set();
    set.add(listener); this.listeners.set(workspaceId, set);
    return () => { set.delete(listener); if (!set.size) this.listeners.delete(workspaceId); };
  }

  publish(workspaceId: string, event: ChannelEvent) {
    for (const listener of this.listeners.get(workspaceId) ?? []) { try { listener(event); } catch { /* one broken connection must not stop the others */ } }
  }
}
