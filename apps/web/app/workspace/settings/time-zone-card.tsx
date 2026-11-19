'use client';

import { useAuth } from '@clerk/nextjs';
import { useMemo, useState } from 'react';
import { timeZoneCookieValue } from '../../time-zone-script';
import { useWorkspaceSession } from '../workspace-shell';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

/** The zone your device reports, ignoring any preference applied on top of it. */
const deviceZone = () => { try { return (Intl.DateTimeFormat as unknown as { deviceZone?: string }).deviceZone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } };

export function TimeZoneCard() {
  const { user } = useWorkspaceSession();
  const { getToken } = useAuth();
  const [zone, setZone] = useState(user.timeZone ?? '');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const zones = useMemo(() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return []; } }, []);
  const preview = useMemo(() => { try { return new Date().toLocaleString([], { timeZone: zone || undefined, dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; } }, [zone]);

  async function save() {
    setBusy(true); setStatus('');
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/session/me`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ timeZone: zone || null }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message ?? 'Could not save your time zone.');
      document.cookie = timeZoneCookieValue(zone || null);
      try { sessionStorage.setItem('aven-tz-synced', '1'); } catch { /* not needed */ }
      window.location.reload();
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save your time zone.'); setBusy(false); }
  }

  return <div className="workspace-settings-card">
    <div><h2>Time zone</h2><p>Times across AVEN, including the calendar, messages and activity, are shown in this zone. Leave it on your device’s zone unless you want something different.</p></div>
    <div className="workspace-settings-toggles">
      <label htmlFor="time-zone">Show times in</label>
      <select id="time-zone" value={zone} onChange={(event) => setZone(event.target.value)} disabled={busy}>
        <option value="">My device’s time zone ({deviceZone()})</option>
        {zones.map((name) => <option key={name} value={name}>{name.replaceAll('_', ' ')}</option>)}
      </select>
      {preview && <p className="workspace-settings-note" suppressHydrationWarning>It’s {preview} there.</p>}
      <button className="workspace-settings-save" onClick={() => void save()} disabled={busy || zone === (user.timeZone ?? '')}>{busy ? 'Saving…' : 'Save time zone'}</button>
    </div>
    {status && <p className="workspace-settings-status" role="alert">{status}</p>}
  </div>;
}
