'use client';

import { useEffect } from 'react';

/** Registers the service worker once, so push notifications and the offline page work on any screen. */
export function ServiceWorkerRegistration() {
  useEffect(() => { if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => undefined); }, []);
  return null;
}
