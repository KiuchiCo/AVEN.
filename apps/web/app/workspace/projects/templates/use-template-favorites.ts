'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useBrowserStorageValue, writeBrowserStorageValue } from './browser-storage';

function storageKey(workspaceId: string) { return `aven.project-template-favorites.${workspaceId}`; }

function decodeFavorites(raw: string): Set<string> {
  if (!raw) return new Set();
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded)) return new Set();
    return new Set(decoded.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch { return new Set(); }
}

export function useTemplateFavorites(workspaceId: string, existingIds: string[], ready: boolean) {
  const key = useMemo(() => storageKey(workspaceId), [workspaceId]);
  const rawFavorites = useBrowserStorageValue(key);
  const favorites = useMemo(() => decodeFavorites(rawFavorites), [rawFavorites]);

  useEffect(() => {
    if (!ready) return;
    const valid = new Set(existingIds);
    const next = [...favorites].filter((id) => valid.has(id));
    if (next.length !== favorites.size) writeBrowserStorageValue(key, JSON.stringify(next));
  }, [existingIds, favorites, key, ready]);

  const toggle = useCallback((templateId: string) => {
    const next = new Set(favorites);
    if (next.has(templateId)) next.delete(templateId); else next.add(templateId);
    writeBrowserStorageValue(key, JSON.stringify([...next]));
  }, [favorites, key]);

  return { favorites, toggle, isFavorite: (templateId: string) => favorites.has(templateId) };
}
