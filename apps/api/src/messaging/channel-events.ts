import { Injectable } from '@nestjs/common';

export type ChannelEvent =
  | { type: 'message'; channelId: string; message: unknown }
  | { type: 'message_updated'; channelId: string; message: unknown }
  | { type: 'message_deleted'; channelId: string; id: string; parentId?: string | null }
  | { type: 'channel'; channel: unknown }
  | { type: 'presence'; online: string[] };

type Listener = { userId: string; send: (event: ChannelEvent) => void };

/**
 * Pushes events to people who have a workspace open. It lives in memory, so it reaches clients connected to this
 * API process only. shortcut: with several API instances, replace this with Postgres LISTEN/NOTIFY or Redis pub/sub.
 */
@Injectable()
export class ChannelEvents {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly open = new Map<string, number>();

  /** Limits how many live connections one person can hold open, so a runaway client can't exhaust the server. Returns a release function, or null when over the limit. */
  acquire(userId: string, max = 5): (() => void) | null {
    const count = this.open.get(userId) ?? 0;
    if (count >= max) return null;
    this.open.set(userId, count + 1);
    let released = false;
    return () => { if (released) return; released = true; const left = (this.open.get(userId) ?? 1) - 1; if (left <= 0) this.open.delete(userId); else this.open.set(userId, left); };
  }

  /** Who currently has this workspace open. */
  online(workspaceId: string): string[] {
    return [...new Set([...(this.listeners.get(workspaceId) ?? [])].map((listener) => listener.userId))];
  }

  subscribe(workspaceId: string, userId: string, send: (event: ChannelEvent) => void): () => void {
    const wasOnline = this.online(workspaceId).includes(userId);
    const listener: Listener = { userId, send };
    const set = this.listeners.get(workspaceId) ?? new Set();
    set.add(listener); this.listeners.set(workspaceId, set);
    if (!wasOnline) this.publish(workspaceId, { type: 'presence', online: this.online(workspaceId) });
    return () => {
      set.delete(listener); if (!set.size) this.listeners.delete(workspaceId);
      if (!this.online(workspaceId).includes(userId)) this.publish(workspaceId, { type: 'presence', online: this.online(workspaceId) });
    };
  }

  /** `audience` limits an event to those people (private conversations). Without it, everyone in the workspace hears it. */
  publish(workspaceId: string, event: ChannelEvent, audience?: string[]) {
    for (const listener of [...(this.listeners.get(workspaceId) ?? [])]) {
      if (audience && !audience.includes(listener.userId)) continue;
      try { listener.send(event); } catch { /* one broken connection must not stop the others */ }
    }
  }
}
