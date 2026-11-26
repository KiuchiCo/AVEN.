'use client';

import { useAuth } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useT } from '../../../i18n';
import { useWorkspaceSession } from '../../workspace-shell';
import { safeRedirectUrl } from '../safe-redirect';
import { apiFetch } from '../../connection-error';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
type Provider = { key: 'GOOGLE' | 'MICROSOFT'; label: string; configured: boolean; setup: string };
type Connection = { id: string; provider: Provider['key']; accountEmail: string; pushEnabled: boolean; status: string; lastSyncedAt: string | null; lastError: string | null; syncing: boolean; pendingOutbound: number; unsentEvents: number; connectedBy: { displayName: string } };
type Overview = { providers: Provider[]; connections: Connection[]; redirectUri: string };
type Summary = { imported: number; updated: number; removed: number; sent: number; conflicts: number; skippedRecurring: number; problems: string[] };
const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function Connections() {
  const t = useT();
  const { workspace } = useWorkspaceSession();
  const { getToken } = useAuth();
  const params = useSearchParams();
  const [data, setData] = useState<Overview | null>(null);
  const [notice, setNotice] = useState(() => (params.get('connected') ? t('cn.connectedNotice') : ''));
  const [error, setError] = useState(() => params.get('error') ?? '');
  const [busy, setBusy] = useState('');
  const [send, setSend] = useState<Record<string, boolean>>({});
  const allowed = workspace.role === 'OWNER' || workspace.role === 'ADMINISTRATOR';

  const call = useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const token = await getToken();
    const response = await apiFetch(`${apiBase}/workspaces/${workspace.id}/integrations/calendar${path}`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
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

  // The card keeps itself current: every few seconds while a sync is running, otherwise every fifteen seconds, and only while the page is on screen.
  const anySyncing = data?.connections.some((connection) => connection.syncing) ?? false;
  useEffect(() => {
    if (!allowed) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible' && busy === '') void call<Overview>('').then(setData).catch(() => undefined); }, anySyncing ? 3000 : 15000);
    return () => clearInterval(timer);
  }, [allowed, call, anySyncing, busy]);

  async function run(key: string, action: () => Promise<string | void>) {
    setBusy(key); setError(''); setNotice('');
    try { const message = await action(); if (message) setNotice(message); setData(await call<Overview>('')); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong.'); }
    finally { setBusy(''); }
  }
  const connect = (provider: Provider['key'], pushEnabled: boolean) => run(`connect-${provider}`, async () => { const { url } = await call<{ url: string }>('/connect', 'POST', { provider, pushEnabled }); window.location.assign(safeRedirectUrl(url, window.location.href)); return t('cn.opening'); });
  const summary = (s: Summary) => { const parts = [s.imported && t('cn.s.added', { n: s.imported }), s.updated && t('cn.s.updated', { n: s.updated }), s.removed && t('cn.s.removed', { n: s.removed }), s.sent && t('cn.s.sent', { n: s.sent }), s.conflicts && t('cn.s.conflicts', { n: s.conflicts })].filter(Boolean); return parts.length ? t('cn.synced', { parts: parts.join(', ') }) : t('cn.upToDate'); };

  if (!allowed) return <section className="workspace-settings-page"><header><p className="workspace-page-eyebrow">{t('set.eyebrow')}</p><h1>{t('cn.title')}</h1><p>{t('cn.onlyAdmins')}</p></header></section>;
  return <section className="workspace-settings-page connections-page">
    <header><p className="workspace-page-eyebrow">{t('set.eyebrow')}</p><h1>{t('cn.title')}</h1><p>{t('cn.desc')}</p></header>
    <p className="workspace-settings-note"><strong>{t('cn.shareNote')}</strong>{t('cn.shareNote2')}</p>
    {notice && <p className="workspace-settings-status" role="status">{notice}</p>}
    {error && <p className="workspace-settings-status" role="alert">{error}</p>}
    {!data ? <p>{t('cn.loading')}</p> : <>
      {data.providers.map((provider) => {
        const existing = data.connections.filter((connection) => connection.provider === provider.key);
        return <div className="workspace-settings-card" key={provider.key}>
          <div><h2>{provider.label}</h2>{provider.configured ? <p>{existing.length ? t('cn.connectedAdd') : t('cn.notConnected')}</p> : <p>{t('cn.awaiting', { app: provider.key === 'GOOGLE' ? t('cn.appGoogle') : t('cn.appMicrosoft'), setup: provider.setup, uri: data.redirectUri })}</p>}</div>
          {existing.map((connection) => <div className="connection-row" key={connection.id}>
            <div><strong>{connection.accountEmail}</strong><small>{t('cn.connectedBy', { name: connection.connectedBy.displayName, status: connection.status === 'ACTIVE' ? (connection.syncing ? t('cn.syncingNow') : connection.lastSyncedAt ? t('cn.lastSynced', { when: when.format(new Date(connection.lastSyncedAt)) }) : t('cn.waitingFirst')) : t('cn.reconnectNeeded') })}</small>{connection.lastError && <small className="connection-error" role="alert">{t('cn.syncError')}: {connection.lastError}</small>}
            {!connection.pushEnabled && <small>{t('cn.sendOff')}</small>}
            {connection.pushEnabled && connection.pendingOutbound > 0 && <small>{t('cn.pending', { n: connection.pendingOutbound })}</small>}</div>
            <label className="connection-toggle"><input type="checkbox" checked={connection.pushEnabled} disabled={busy !== ''} onChange={(event) => { let existing: 'send' | 'skip' | undefined; if (event.target.checked && connection.unsentEvents > 0) { if (window.confirm(t('cn.confirmSend', { n: connection.unsentEvents }))) existing = 'send'; else if (window.confirm(t('cn.onlyNew'))) existing = 'skip'; else return; } void run(`push-${connection.id}`, async () => { await call(`/${connection.id}`, 'PATCH', { pushEnabled: event.target.checked, ...(existing ? { existing } : {}) }); }); }} /> {t('cn.alsoSend')}</label>
            <div className="connection-actions">
              {connection.status === 'ACTIVE' ? <button disabled={busy !== '' || connection.syncing} onClick={() => void run(`sync-${connection.id}`, async () => summary(await call<Summary>(`/${connection.id}/sync`, 'POST')))}>{busy === `sync-${connection.id}` ? t('cn.syncing') : t('cn.syncNow')}</button> : <button disabled={busy !== ''} onClick={() => void connect(provider.key, connection.pushEnabled)}>{t('cn.reconnect')}</button>}
              <button disabled={busy !== ''} onClick={() => { if (window.confirm(t('cn.confirmDisconnect', { email: connection.accountEmail }))) void run(`disconnect-${connection.id}`, async () => { await call(`/${connection.id}`, 'DELETE'); return t('cn.disconnected'); }); }}>{t('cn.disconnect')}</button>
            </div>
          </div>)}
          {provider.configured && <div className="connection-add"><label className="connection-toggle"><input type="checkbox" checked={send[provider.key] ?? false} onChange={(event) => setSend({ ...send, [provider.key]: event.target.checked })} /> {t('cn.alsoSendThis')}</label><button className="workspace-settings-save" disabled={busy !== ''} onClick={() => void connect(provider.key, send[provider.key] ?? false)}>{existing.length ? t('cn.addAnother') : t('cn.connect', { label: provider.label })}</button></div>}
        </div>;
      })}
      <p className="workspace-settings-note">{t('cn.autoSync')}</p>
      <p className="workspace-settings-note">{t('cn.foot')}</p>
    </>}
  </section>;
}

export default function ConnectionsPage() {
  return <Suspense fallback={<p>…</p>}><Connections /></Suspense>;
}
