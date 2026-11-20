'use client';

import { useSyncExternalStore } from 'react';
import { useT } from '../i18n';

const subscribe = (notify: () => void) => { window.addEventListener('online', notify); window.addEventListener('offline', notify); return () => { window.removeEventListener('online', notify); window.removeEventListener('offline', notify); }; };

/** Says plainly when the browser has no connection, because edits can't be saved until it returns. */
export function OfflineBanner() {
  const t = useT();
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return online ? null : <p className="workspace-readonly-banner" role="status">{t('shell.offline')}</p>;
}
