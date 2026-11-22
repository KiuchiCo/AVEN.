'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/en';
import { haptic, isNativeApp, native } from '../../mobile/native';
import { registerDevice } from '../../mobile/native-events';

type Biometry = { available: boolean; type: string; lockEnabled: boolean };

/** Settings that belong to this iPhone or iPad, not to the account: notifications for this device, and the app lock. Only shown inside the iOS/iPadOS app. */
export function DeviceCard() {
  const t = useT();
  const { getToken } = useAuth();
  const [shown, setShown] = useState(false);
  const [push, setPush] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [biometry, setBiometry] = useState<Biometry | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const plugin = native(); if (!isNativeApp() || !plugin) return;
    let live = true;
    void Promise.all([plugin.pushStatus(), plugin.biometryStatus()]).then(([status, bio]) => { if (!live) return; setShown(true); setPush(status.permission); setBiometry(bio); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  if (!shown) return null;

  async function enablePush() {
    const plugin = native(); if (!plugin) return;
    setBusy(true); setMessage('');
    try {
      const { granted } = await plugin.registerForPush();
      setPush(granted ? 'granted' : 'denied');
      if (!granted) { setMessage(t('mobile.push.denied')); return; }
      // The token arrives a moment after permission is given; the page-wide listener registers it, and this covers a token the device already has.
      const status = await plugin.pushStatus();
      if (status.token) await registerDevice(getToken, status.token, status.environment);
      haptic('success'); setMessage(t('mobile.push.enabled'));
    } catch { setMessage(t('mobile.push.failed')); } finally { setBusy(false); }
  }

  async function toggleLock(enabled: boolean) {
    const plugin = native(); if (!plugin) return;
    setBusy(true); setMessage('');
    try { const result = await plugin.setAppLock({ enabled }); setBiometry((current) => current && { ...current, lockEnabled: result.lockEnabled }); if (result.lockEnabled !== enabled) setMessage(t('mobile.lock.failed')); else haptic('success'); }
    catch { setMessage(t('mobile.lock.unavailable')); } finally { setBusy(false); }
  }

  const method = t(`mobile.lock.${biometry?.type === 'none' ? 'passcode' : biometry?.type ?? 'passcode'}` as Key);
  return <div className="workspace-settings-card" aria-labelledby="device-card-title">
    <div><h2 id="device-card-title">{t('mobile.device.title')}</h2><p>{t('mobile.device.hint')}</p></div>
    <div className="device-row">
      <div><strong>{t('mobile.push')}</strong><p>{push === 'granted' ? t('mobile.push.enabled') : push === 'denied' ? t('mobile.push.denied') : t('mobile.push.hint')}</p></div>
      {push !== 'granted' && push !== 'denied' && <button type="button" className="workspace-settings-save" onClick={() => void enablePush()} disabled={busy}>{t('mobile.push.on')}</button>}
    </div>
    <div className="device-row">
      <div><strong id="app-lock-label">{t('mobile.lock')}</strong><p id="app-lock-hint">{biometry?.available ? t('mobile.lock.hint', { method }) : t('mobile.lock.unavailable')}</p></div>
      <label className="device-switch"><input type="checkbox" role="switch" aria-labelledby="app-lock-label" aria-describedby="app-lock-hint" checked={Boolean(biometry?.lockEnabled)} disabled={busy || !biometry?.available} onChange={(event) => void toggleLock(event.target.checked)} /><span aria-hidden="true" /></label>
    </div>
    {message && <p className="workspace-settings-status" role="status">{message}</p>}
  </div>;
}
