'use client';

import { useAuth } from '@clerk/nextjs';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { connectionError } from './connection-error';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
export type FavouriteKind = 'PROJECT' | 'DOCUMENT' | 'DATABASE' | 'WHITEBOARD';
export type Favourite = { id: string; kind: FavouriteKind; entityId: string; title: string; href: string };
type Store = { items: Favourite[]; isPinned: (kind: FavouriteKind, entityId: string) => boolean; toggle: (kind: FavouriteKind, entityId: string) => Promise<string | null> };

const FavouritesContext = createContext<Store | null>(null);
export const useFavourites = () => useContext(FavouritesContext);

/** One shared list for the sidebar and every star button, so pinning on a page shows up in the sidebar at once. */
export function FavouritesProvider({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const { getToken } = useAuth();
  const [items, setItems] = useState<Favourite[]>([]);
  const request = useCallback(async (method: string, body?: unknown) => {
    const token = await getToken(); if (!token || !apiBase) throw connectionError(token);
    const response = await fetch(`${apiBase}/workspaces/${workspaceId}/favourites`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(json?.message ?? 'AVEN could not complete that request.');
    return json;
  }, [getToken, workspaceId]);

  useEffect(() => { let live = true; void request('GET').then((list) => { if (live) setItems(list as Favourite[]); }).catch(() => undefined); return () => { live = false; }; }, [request]);

  const store = useMemo<Store>(() => ({
    items,
    isPinned: (kind, entityId) => items.some((item) => item.kind === kind && item.entityId === entityId),
    toggle: async (kind, entityId) => {
      try {
        await request(items.some((item) => item.kind === kind && item.entityId === entityId) ? 'DELETE' : 'POST', { kind, entityId });
        setItems(await request('GET') as Favourite[]); return null;
      } catch (reason) { return reason instanceof Error ? reason.message : 'Could not update your favourites.'; }
    },
  }), [items, request]);
  return <FavouritesContext.Provider value={store}>{children}</FavouritesContext.Provider>;
}

/** A star that pins the page's item to the sidebar's Favourites. */
export function FavouriteStar({ kind, entityId }: { kind: FavouriteKind; entityId: string | undefined }) {
  const store = useFavourites();
  const [message, setMessage] = useState('');
  if (!store || !entityId) return null;
  const pinned = store.isPinned(kind, entityId);
  return <>
    <button type="button" className={`favourite-star${pinned ? ' is-on' : ''}`} aria-pressed={pinned} aria-label={pinned ? 'Remove from favourites' : 'Add to favourites'} title={pinned ? 'Remove from favourites' : 'Add to favourites'} onClick={() => void store.toggle(kind, entityId).then((error) => setMessage(error ?? ''))}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z" /></svg>
    </button>
    {message && <span className="favourite-star__error" role="alert">{message}</span>}
  </>;
}
