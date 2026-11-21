import type { Request } from './project-api';
import type { SavedTaskView } from './project-model';

/** Task views saved in this browser before they were shared are copied to the workspace once, then forgotten locally. */
export async function importLegacyViews(request: Request, workspaceId: string, current: SavedTaskView[]): Promise<{ views: SavedTaskView[]; remaining: number }> {
  let views = current;
  let remaining = 0;
  const legacyKey = `aven.task-views.${workspaceId}`;
  const importedKey = `aven.task-views-imported.${workspaceId}`;
  try {
    const raw = localStorage.getItem(legacyKey);
    const legacy = raw ? JSON.parse(raw) as unknown : [];
    const importedRaw = localStorage.getItem(importedKey);
    const imported = new Set(importedRaw ? JSON.parse(importedRaw) as string[] : []);
    if (!Array.isArray(legacy)) return { views, remaining };
    for (const item of legacy) {
      if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || !item.filters || typeof item.filters !== 'object' || imported.has(item.id)) continue;
      if (views.length >= 20) { remaining += 1; continue; }
      const base = item.name.trim().slice(0, 48) || 'Imported view';
      let name = base; let suffix = 2;
      while (views.some((view) => view.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { const tail = ` (local ${suffix++})`; name = `${base.slice(0, 60 - tail.length)}${tail}`; }
      try {
        const saved = await request<SavedTaskView>('/tasks/views', { method: 'POST', body: JSON.stringify({ name, filters: item.filters }) });
        views = [saved, ...views]; imported.add(item.id); localStorage.setItem(importedKey, JSON.stringify([...imported]));
      } catch { remaining += 1; }
    }
    if (remaining === 0) { localStorage.removeItem(legacyKey); localStorage.removeItem(importedKey); }
  } catch { remaining = Math.max(remaining, 1); }
  return { views, remaining };
}
