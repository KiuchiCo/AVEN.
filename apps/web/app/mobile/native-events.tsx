'use client';

import { useAuth, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { deviceClass, isNativeApp, native, nativePlatform, routeForLink } from './native';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

/** Tells the API which device to send this person's notifications to. Called again whenever Apple hands out a new token. */
export async function registerDevice(getToken: () => Promise<string | null>, token: string, environment: string): Promise<boolean> {
  const bearer = await getToken(); if (!bearer || !apiBase) return false;
  const response = await fetch(`${apiBase}/push/devices`, { method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ token, environment }) }).catch(() => null);
  return Boolean(response?.ok);
}

/** Stops notifications to this device. It needs no sign-in (the person has just signed out): the device's own notification token is the proof, and it is only ever known to this device and the API. */
export async function unregisterDevice(): Promise<void> {
  const status = await native()?.pushStatus().catch(() => null);
  if (!apiBase || !status?.token) return;
  await fetch(`${apiBase}/push/devices/unregister`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: status.token }) }).catch(() => undefined);
}

/**
 * Connects the screen to the iOS/iPadOS app around it. It draws nothing, and does nothing in a browser.
 *  - marks the page as running in the app and as iPhone or iPad, so the layout can adapt;
 *  - opens the right screen for a link (aven://…) or a tapped notification, after checking it is one of AVEN.'s own screens;
 *  - keeps the API's record of this device's notification token up to date;
 *  - on sign-out, stops notifications to this device and clears what it holds (cached pages, drafts, keychain items), so the next person starts clean.
 */
export function NativeEvents() {
  const router = useRouter();
  const { getToken } = useAuth();
  const clerk = useClerk();

  useEffect(() => {
    if (!isNativeApp()) return;
    const root = document.documentElement; root.dataset.native = nativePlatform();
    const classify = () => { root.dataset.device = deviceClass(window.innerWidth, navigator.maxTouchPoints); };
    classify(); window.addEventListener('resize', classify);
    return () => { window.removeEventListener('resize', classify); delete root.dataset.native; delete root.dataset.device; };
  }, []);

  useEffect(() => {
    const plugin = native(); if (!plugin) return;
    const open = (link: string) => { const route = routeForLink(link, window.location.origin); if (route) router.push(route); };
    const listeners: Promise<{ remove: () => Promise<void> }>[] = [
      plugin.addListener('deepLink', (data) => open(data.url ?? '')),
      plugin.addListener('pushAction', (data) => open(data.path ?? '')),
      plugin.addListener('pushToken', (data) => { if (data.token) void registerDevice(getToken, data.token, data.environment ?? 'production'); }),
    ];
    void plugin.consumePending().then(({ links }) => links.forEach(open)).catch(() => undefined);
    void plugin.pushStatus().then((status) => { if (status.permission === 'granted' && status.token) void registerDevice(getToken, status.token, status.environment); }).catch(() => undefined);
    return () => { // the bridge hands back a handle, not always a promise of one
      listeners.forEach((listener) => void Promise.resolve(listener).then((handle) => handle?.remove?.()).catch(() => undefined)); };
  }, [router, getToken]);

  // When the person signs out (by any route), stop notifications to this device and clear what it holds.
  useEffect(() => {
    const plugin = native(); if (!plugin) return;
    let signedIn = Boolean(clerk.user);
    return clerk.addListener(({ user }) => {
      const now = Boolean(user);
      if (signedIn && !now) void unregisterDevice().finally(() => plugin.wipeLocalData().catch(() => undefined));
      signedIn = now;
    });
  }, [clerk]);

  return null;
}
