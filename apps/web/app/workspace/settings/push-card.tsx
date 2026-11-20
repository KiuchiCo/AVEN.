'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../i18n';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
type Mode = 'loading' | 'unsupported' | 'off-server' | 'blocked' | 'off' | 'on';

const keyBytes = (key: string) => { const padded = key.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(key.length / 4) * 4, '='); return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)); };

/** Turns browser notifications on or off for this device. */
export function PushCard() {
  const { getToken } = useAuth();
  const t = useT();
  const [mode, setMode] = useState<Mode>('loading');
  const [publicKey, setPublicKey] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const call = useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API.');
    const response = await fetch(`${apiBase}/push${path}`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(json?.message ?? 'AVEN could not complete that request.');
    return json as T;
  }, [getToken]);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setMode('unsupported'); return; }
      const config = await call<{ enabled: boolean; publicKey: string | null }>('/config');
      if (!config.enabled || !config.publicKey) { setMode('off-server'); return; }
      setPublicKey(config.publicKey);
      if (Notification.permission === 'denied') { setMode('blocked'); return; }
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      setMode(registration && await registration.pushManager.getSubscription() ? 'on' : 'off');
    }).catch((error) => { setMessage(error instanceof Error ? error.message : 'Could not check notifications.'); setMode('off-server'); });
  }, [call]);

  async function enable() {
    setBusy(true); setMessage('');
    try {
      if (await Notification.requestPermission() !== 'granted') { setMode('blocked'); return; }
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const subscription = (await registration.pushManager.getSubscription()) ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      await call('/subscriptions', 'POST', subscription.toJSON());
      setMode('on'); setMessage(t('set.push.nowOn'));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not turn notifications on.'); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMessage('');
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) { await call('/subscriptions', 'DELETE', { endpoint: subscription.endpoint }); await subscription.unsubscribe(); }
      setMode('off'); setMessage(t('set.push.nowOff'));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not turn notifications off.'); }
    finally { setBusy(false); }
  }

  const note: Partial<Record<Mode, string>> = {
    unsupported: t('set.push.unsupported'),
    'off-server': t('set.push.offServer'),
    blocked: t('set.push.blocked'),
  };
  return <div className="workspace-settings-card">
    <div><h2>{t('set.push.title')}</h2><p>{t('set.push.hint')}</p></div>
    {mode === 'loading' ? <p>{t('set.push.checking')}</p> : note[mode] ? <p className="workspace-settings-note">{note[mode]}</p> : <div className="billing-actions">
      {mode === 'on' ? <button className="workspace-settings-save" disabled={busy} onClick={() => void disable()}>{t('set.push.off')}</button> : <button className="workspace-settings-save" disabled={busy} onClick={() => void enable()}>{t('set.push.on')}</button>}
    </div>}
    {message && <p className="workspace-settings-status" role="status">{message}</p>}
  </div>;
}
