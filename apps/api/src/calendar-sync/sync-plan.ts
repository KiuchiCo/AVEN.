import type { RemoteEvent } from './remote-events.js';

export type Link = { id: string; eventId: string | null; externalId: string; etag: string | null; localSyncedAt: Date };
export type Local = { id: string; updatedAt: Date; startsAt: Date; recurring: boolean };
export type Action =
  | { type: 'createLocal'; remote: RemoteEvent }
  | { type: 'updateLocal'; linkId: string; eventId: string; remote: RemoteEvent; conflict: boolean }
  | { type: 'deleteLocal'; linkId: string; eventId: string }
  | { type: 'pushCreate'; eventId: string }
  | { type: 'pushUpdate'; linkId: string; eventId: string; externalId: string; etag: string | null; conflict: boolean }
  | { type: 'pushDelete'; linkId: string; externalId: string }
  | { type: 'dropLink'; linkId: string };
export type Plan = { actions: Action[]; skippedRecurring: number };

/**
 * Decides what a sync must do, without touching anything. Rules:
 *  - An event is matched by its link, never by its text, so nothing is ever duplicated.
 *  - Only one side changed: that change is copied across.
 *  - Both changed: the later edit wins (and when AVEN isn't sending changes, the provider's copy wins). It is reported.
 *  - Deleted on the provider: deleted here too (only if it falls inside the synced window).
 *  - Deleted in AVEN: stays deleted. If sending is on, it is deleted on the provider too; otherwise it is simply not re-imported.
 *  - AVEN events with no link at all are sent only when sending is on. Repeating ones are skipped: providers use their own repeat rules.
 */
export function planSync(input: { remote: RemoteEvent[]; links: Link[]; locals: Map<string, Local>; unlinked: Local[]; pushEnabled: boolean; window: { from: Date; to: Date } }): Plan {
  const { links, locals, pushEnabled, window } = input;
  const actions: Action[] = [];
  const remoteById = new Map<string, RemoteEvent>(); const cancelled = new Set<string>();
  for (const remote of input.remote) { if (remote.cancelled) cancelled.add(remote.id); else remoteById.set(remote.id, remote); }
  const linked = new Set(links.map((link) => link.externalId));
  const inWindow = (date: Date) => date >= window.from && date <= window.to;

  for (const link of links) {
    const remote = remoteById.get(link.externalId);
    if (link.eventId === null || !locals.has(link.eventId)) {
      // Deleted in AVEN.
      if (remote && pushEnabled) actions.push({ type: 'pushDelete', linkId: link.id, externalId: link.externalId });
      else if (!remote) actions.push({ type: 'dropLink', linkId: link.id });
      continue;
    }
    const local = locals.get(link.eventId)!;
    if (!remote) {
      if (cancelled.has(link.externalId) || inWindow(local.startsAt)) actions.push({ type: 'deleteLocal', linkId: link.id, eventId: local.id });
      continue;
    }
    const localChanged = local.updatedAt.getTime() > link.localSyncedAt.getTime();
    if (remote.etag === link.etag) {
      if (localChanged && pushEnabled && !local.recurring) actions.push({ type: 'pushUpdate', linkId: link.id, eventId: local.id, externalId: link.externalId, etag: link.etag, conflict: false });
      continue;
    }
    if (!localChanged) { actions.push({ type: 'updateLocal', linkId: link.id, eventId: local.id, remote, conflict: false }); continue; }
    // Both sides changed.
    if (!pushEnabled || remote.updatedAt.getTime() >= local.updatedAt.getTime()) actions.push({ type: 'updateLocal', linkId: link.id, eventId: local.id, remote, conflict: true });
    else actions.push({ type: 'pushUpdate', linkId: link.id, eventId: local.id, externalId: link.externalId, etag: remote.etag, conflict: true });
  }

  for (const remote of remoteById.values()) if (!linked.has(remote.id)) actions.push({ type: 'createLocal', remote });

  let skippedRecurring = 0;
  if (pushEnabled) for (const local of input.unlinked) { if (local.recurring) skippedRecurring += 1; else if (inWindow(local.startsAt)) actions.push({ type: 'pushCreate', eventId: local.id }); }
  return { actions, skippedRecurring };
}
