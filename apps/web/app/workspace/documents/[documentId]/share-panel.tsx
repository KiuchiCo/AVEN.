'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../../i18n';
import { useWorkspaceSession } from '../../workspace-shell';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
type Share = { id: string; createdAt: string; expiresAt: string | null; revokedAt: string | null; viewCount: number; lastViewedAt: string | null; state: 'ACTIVE' | 'EXPIRED' | 'REVOKED'; createdBy: { displayName: string } };
const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function SharePanel({ documentId }: { documentId: string }) {
  const t = useT();
  const { workspace } = useWorkspaceSession();
  const { getToken } = useAuth();
  const [shares, setShares] = useState<Share[]>([]);
  const [expiry, setExpiry] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const readOnly = workspace.role === 'GUEST';

  const call = useCallback(async <T,>(path = '', method = 'GET', body?: unknown): Promise<T> => {
    const token = await getToken();
    const response = await fetch(`${apiBase}/workspaces/${workspace.id}/documents/${documentId}/shares${path}`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(json?.message ?? 'AVEN could not complete that request.');
    return json as T;
  }, [documentId, getToken, workspace.id]);

  useEffect(() => { let live = true; void call<Share[]>().then((list) => { if (live) setShares(list); }).catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : 'Could not load share links.'); }); return () => { live = false; }; }, [call]);

  async function create() {
    setError(''); setCopied(false);
    try { const made = await call<{ url: string }>('', 'POST', expiry ? { expiresInDays: Number(expiry) } : {}); setFresh(made.url); setShares(await call<Share[]>()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the link.'); }
  }
  async function revoke(share: Share) {
    if (!window.confirm(t('sh.confirmOff'))) return;
    try { await call(`/${share.id}`, 'DELETE'); setShares(await call<Share[]>()); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not turn the link off.'); }
  }

  return <section className="document-studio__panel share-panel">
    <h2>{t('sh.title')}</h2>
    <p>{t('sh.intro')}</p>
    {!readOnly && <div className="share-panel__create"><label htmlFor="share-expiry">{t('sh.expires')}</label><select id="share-expiry" value={expiry} onChange={(event) => setExpiry(event.target.value)}><option value="">{t('sh.never')}</option><option value="7">{t('sh.in7')}</option><option value="30">{t('sh.in30')}</option><option value="90">{t('sh.in90')}</option></select><button type="button" onClick={() => void create()}>{t('sh.create')}</button></div>}
    {fresh && <div className="share-panel__fresh" role="status"><p>{t('sh.copyNow')}</p><input readOnly value={fresh} aria-label={t('sh.newLink')} onFocus={(event) => event.target.select()} /><button type="button" onClick={() => { void navigator.clipboard?.writeText(fresh).then(() => setCopied(true)); }}>{copied ? t('sh.copied') : t('sh.copy')}</button></div>}
    {error && <p className="workspace-settings-status" role="alert">{error}</p>}
    {shares.length === 0 ? <p className="productivity-message">{t('sh.none')}</p> : <ul className="share-panel__list">{shares.map((share) => <li key={share.id} className={share.state !== 'ACTIVE' ? 'is-off' : ''}>
      <div><strong>{share.state === 'ACTIVE' ? t('sh.active') : share.state === 'EXPIRED' ? t('sh.expired') : t('sh.off')}</strong><small>{t('sh.madeBy', { name: share.createdBy.displayName, when: when.format(new Date(share.createdAt)) })}{share.expiresAt && share.state === 'ACTIVE' ? t('sh.expiresOn', { when: when.format(new Date(share.expiresAt)) }) : ''}</small><small>{t(share.viewCount === 1 ? 'sh.viewOne' : 'sh.viewMany', { n: share.viewCount })}{share.lastViewedAt ? t('sh.last', { when: when.format(new Date(share.lastViewedAt)) }) : ''}</small></div>
      {!readOnly && share.state === 'ACTIVE' && <button type="button" onClick={() => void revoke(share)}>{t('sh.turnOff')}</button>}
    </li>)}</ul>}
  </section>;
}
