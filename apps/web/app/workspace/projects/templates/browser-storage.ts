'use client';

import { useCallback, useSyncExternalStore } from 'react';

const fallbackValues = new Map<string, string>();
const localChangeEvent = 'aven:browser-storage-change';

function readValue(key: string): string {
  try { return window.localStorage.getItem(key) ?? fallbackValues.get(key) ?? ''; }
  catch { return fallbackValues.get(key) ?? ''; }
}

function subscribe(key: string, notify: () => void) {
  const onStorage = (event: Event) => {
    if (event.type === 'storage') {
      const storageEvent = event as StorageEvent;
      if (storageEvent.key !== key && storageEvent.key !== null) return;
      if (storageEvent.key === null || storageEvent.newValue === null) fallbackValues.delete(key);
      else fallbackValues.set(key, storageEvent.newValue);
    } else if ((event as CustomEvent<string>).detail !== key) return;
    notify();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(localChangeEvent, onStorage);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(localChangeEvent, onStorage);
  };
}

export function useBrowserStorageValue(key: string): string {
  const getSnapshot = useCallback(() => readValue(key), [key]);
  const subscribeToKey = useCallback((notify: () => void) => subscribe(key, notify), [key]);
  return useSyncExternalStore(subscribeToKey, getSnapshot, () => '');
}

export function writeBrowserStorageValue(key: string, value: string | null): boolean {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    if (value === null) fallbackValues.delete(key);
    else fallbackValues.set(key, value);
    window.dispatchEvent(new CustomEvent(localChangeEvent, { detail: key }));
    return false;
  }
  if (value === null) fallbackValues.delete(key);
  else fallbackValues.set(key, value);
  window.dispatchEvent(new CustomEvent(localChangeEvent, { detail: key }));
  return true;
}
