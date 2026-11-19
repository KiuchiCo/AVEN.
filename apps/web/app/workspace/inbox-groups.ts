export type Update = { id: string; entityType: string; entityId: string; message: string; createdAt: string; isRead: boolean; actor: { displayName: string } };
export type UpdateGroup = { key: string; latest: Update; items: Update[]; unread: number; actors: string[] };

/**
 * One row per thing that changed: all updates about the same item (a task and its comments and checklist, say) fold
 * together, newest first. Groups are ordered by their newest update. Nothing is dropped, and the order is stable.
 */
export function groupUpdates(updates: Update[]): UpdateGroup[] {
  const groups = new Map<string, Update[]>();
  for (const update of [...updates].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id))) {
    const key = update.entityId; const list = groups.get(key);
    if (list) list.push(update); else groups.set(key, [update]);
  }
  return [...groups].map(([key, items]) => ({ key, latest: items[0], items, unread: items.filter((item) => !item.isRead).length, actors: [...new Set(items.map((item) => item.actor.displayName))] }));
}

/** "Ana", "Ana and Ben", "Ana, Ben and 2 others". */
export function actorSummary(actors: string[]): string {
  if (actors.length <= 1) return actors[0] ?? '';
  if (actors.length === 2) return `${actors[0]} and ${actors[1]}`;
  return `${actors[0]}, ${actors[1]} and ${actors.length - 2} other${actors.length - 2 === 1 ? '' : 's'}`;
}
