'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

function storageKey(workspaceId: string) { return `aven.project-template-favorites.${workspaceId}`; }

function decodeFavorites(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded)) return new Set();
    return new Set(decoded.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch { return new Set(); }
}

function readFavorites(key: string) {
  try { return decodeFavorites(window.localStorage.getItem(key)); } catch { return new Set<string>(); }
}

export function useTemplateFavorites(workspaceId: string, existingIds: string[], ready: boolean) {
  const [favorites, setFavorites] = useState<Set<string>>(() => typeof window === 'undefined' ? new Set() : readFavorites(storageKey(workspaceId)));
  const key = useMemo(() => storageKey(workspaceId), [workspaceId]);

  useEffect(() => {
    setFavorites(readFavorites(key));
    function sync(event: StorageEvent) {
      if (event.key === key) setFavorites(decodeFavorites(event.newValue));
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    const valid = new Set(existingIds);
    setFavorites((current) => {
      const next = new Set([...current].filter((id) => valid.has(id)));
      if (next.size !== current.size) {
        try { window.localStorage.setItem(key, JSON.stringify([...next])); } catch { /* Browser storage can be disabled; the in-memory favorites remain available. */ }
      }
      return next;
    });
  }, [existingIds, key, ready]);

  const toggle = useCallback((templateId: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(templateId)) next.delete(templateId); else next.add(templateId);
      try { window.localStorage.setItem(key, JSON.stringify([...next])); } catch { /* Keep the current session responsive if storage is unavailable. */ }
      return next;
    });
  }, [key]);

  return { favorites, toggle, isFavorite: (templateId: string) => favorites.has(templateId) };
}
