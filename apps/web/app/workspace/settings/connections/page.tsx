'use client';

import { useAuth } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useWorkspaceSession } from '../../workspace-shell';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
type Provider = { key: 'GOOGLE' | 'MICROSOFT'; label: string; configured: boolean; setup: string };
type Connection = { id: string; provider: Provider['key']; accountEmail: string; pushEnabled: boolean; status: string; lastSyncedAt: string | null; lastError: string | null; connectedBy: { displayName: string } };
type Overview = { providers: Provider[]; connections: Connection[]; redirectUri: string };
type Summary = { imported: number; updated: number; removed: number; sent: number; conflicts: number; skippedRecurring: number; problems: string[] };
const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function Connections() {
  const { workspace } = useWorkspaceSession();
  const { getToken } = useAuth();
  const params = useSearchParams();
  const [data, setData] = useState<Overview | null>(null);
  const [notice, setNotice] = useState(() => (params.get('connected') ? 'Calendar connected. Your events are being imported now.' : ''));
  const [error, setError] = useState(() => params.get('error') ?? '');
  const [busy, setBusy] = useState('');
  const [send, setSend] = useState<Record<string, boolean>>({});
  const allowed = workspace.role === 'OWNER' || workspace.role === 'ADMINISTRATOR';

  const call = useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const token = await getToken();
    const response = await fetch(`${apiBase}/workspaces/${workspace.id}/integrations/calendar${path}`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(json?.message ?? 'AVEN could not complete that request.');
    return json as T;
  }, [getToken, workspace.id]);

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    void call<Overview>('').then((overview) => { if (live) setData(overview); }).catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : 'Could not load connections.'); });
    return () => { live = false; };
  }, [allowed, call]);

  async function run(key: string, action: () => Promise<string | void>) {
    setBusy(key); setError(''); setNotice('');
    try { const message = await action(); if (message) setNotice(message); setData(await call<Overview>('')); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong.'); }
    finally { setBusy(''); }
  }
  const connect = (provider: Provider['key'], pushEnabled: boolean) => run(`connect-${provider}`, async () => { const { url } = await call<{ url: string }>('/connect', 'POST', { provider, pushEnabled }); window.location.assign(url); return 'Opening the sign-in page…'; });
  const summary = (s: Summary) => { const parts = [s.imported && `${s.imported} added`, s.updated && `${s.updated} updated`, s.removed && `${s.removed} removed`, s.sent && `${s.sent} sent`, s.conflicts && `${s.conflicts} edited in both places`].filter(Boolean); return parts.length ? `Synced: ${parts.join(', ')}.` : 'Everything was already up to date.'; };

  if (!allowed) return <section className="workspace-settings-page"><header><p className="workspace-page-eyebrow">SETTINGS</p><h1>Connected apps</h1><p>Only workspace owners and administrators can connect calendars.</p></header></section>;
  return <section className="workspace-settings-page connections-page">
    <header><p className="workspace-page-eyebrow">SETTINGS</p><h1>Connected apps</h1><p>Bring events from Google Calendar or Outlook into this workspace’s calendar.</p></header>
    <p className="workspace-settings-note"><strong>Everyone in this workspace will see the events you import.</strong> Connect a calendar you’re happy to share, and use a shared workspace only for work calendars.</p>
    {notice && <p className="workspace-settings-status" role="status">{notice}</p>}
    {error && <p className="workspace-settings-status" role="alert">{error}</p>}
    {!data ? <p>Loading…</p> : <>
      {data.providers.map((provider) => {
        const existing = data.connections.filter((connection) => connection.provider === provider.key);
        return <div className="workspace-settings-card" key={provider.key}>
          <div><h2>{provider.label}</h2>{provider.configured ? <p>{existing.length ? 'Connected. You can add another account.' : 'Not connected yet.'}</p> : <p>Awaiting credentials. An administrator needs to create a {provider.key === 'GOOGLE' ? 'Google Cloud' : 'Microsoft Entra'} OAuth app and set <code>{provider.setup}</code> and <code>TOKEN_ENCRYPTION_KEY</code> for the API. Use this redirect address: <code>{data.redirectUri}</code></p>}</div>
          {existing.map((connection) => <div className="connection-row" key={connection.id}>
            <div><strong>{connection.accountEmail}</strong><small>Connected by {connection.connectedBy.displayName} · {connection.status === 'ACTIVE' ? (connection.lastSyncedAt ? `last synced ${when.format(new Date(connection.lastSyncedAt))}` : 'waiting for the first sync') : 'needs to be reconnected'}</small>{connection.lastError && <small className="connection-error">{connection.lastError}</small>}</div>
            <label className="connection-toggle"><input type="checkbox" checked={connection.pushEnabled} disabled={busy !== ''} onChange={(event) => void run(`push-${connection.id}`, async () => { await call(`/${connection.id}`, 'PATCH', { pushEnabled: event.target.checked }); })} /> Also send events made in AVEN</label>
            <div className="connection-actions">
              {connection.status === 'ACTIVE' ? <button disabled={busy !== ''} onClick={() => void run(`sync-${connection.id}`, async () => summary(await call<Summary>(`/${connection.id}/sync`, 'POST')))}>{busy === `sync-${connection.id}` ? 'Syncing…' : 'Sync now'}</button> : <button disabled={busy !== ''} onClick={() => void connect(provider.key, connection.pushEnabled)}>Reconnect</button>}
              <button disabled={busy !== ''} onClick={() => { if (window.confirm(`Disconnect ${connection.accountEmail}? Events already imported stay in AVEN but stop updating.`)) void run(`disconnect-${connection.id}`, async () => { await call(`/${connection.id}`, 'DELETE'); return 'Disconnected.'; }); }}>Disconnect</button>
            </div>
          </div>)}
          {provider.configured && <div className="connection-add"><label className="connection-toggle"><input type="checkbox" checked={send[provider.key] ?? false} onChange={(event) => setSend({ ...send, [provider.key]: event.target.checked })} /> Also send events made in AVEN to this calendar</label><button className="workspace-settings-save" disabled={busy !== ''} onClick={() => void connect(provider.key, send[provider.key] ?? false)}>{existing.length ? 'Add another account' : `Connect ${provider.label}`}</button></div>}
        </div>;
      })}
      <p className="workspace-settings-note">Imported events cover the last 30 days and the next 6 months. An event made in AVEN goes to one calendar only, and repeating events made in AVEN aren’t sent, because calendars use their own repeat rules.</p>
    </>}
  </section>;
}

export default function ConnectionsPage() {
  return <Suspense fallback={<p>Loading…</p>}><Connections /></Suspense>;
}
