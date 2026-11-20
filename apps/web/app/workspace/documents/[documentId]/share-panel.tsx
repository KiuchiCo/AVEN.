'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../../i18n';
import { useWorkspaceSession } from '../../workspace-shell';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
type Share = { id: string; createdAt: string; expiresAt: string | null; revokedAt: string | null; viewCount: number; lastViewedAt: string | null; state: 'ACTIVE' | 'EXPIRED' | 'REVOKED'; allowDownload: boolean; allowPrint: boolean; includeEmbeds: boolean; createdBy: { displayName: string } };
type Made = Share & { url: string };
const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
/** The days left on a link's expiry, rounded to the nearest of the choices offered, so the menu shows what is set. */
const nearestChoice = (expiresAt: string | null) => { if (!expiresAt) return ''; const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000; return String([7, 30, 90].reduce((best, choice) => (Math.abs(choice - days) < Math.abs(best - days) ? choice : best), 7)); };

/**
 * Sharing a document with people who have no AVEN account. One public link at a time: turn it on, copy it, choose what it allows, replace it
 * or turn it off. The address contains a random secret that the server keeps only as a hash, so it can be shown when it is created and never again.
 */
export function SharePanel({ documentId }: { documentId: string }) {
  const t = useT();
  const { workspace } = useWorkspaceSession();
  const { getToken } = useAuth();
  const [shares, setShares] = useState<Share[]>([]);
  const [fresh, setFresh] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const readOnly = workspace.role === 'GUEST';

  const call = useCallback(async <T,>(path = '', method = 'GET', body?: unknown): Promise<T> => {
    const token = await getToken();
    const response = await fetch(`${apiBase}/workspaces/${workspace.id}/documents/${documentId}/shares${path}`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(json?.message ?? 'AVEN could not complete that request.');
    return json as T;
  }, [documentId, getToken, workspace.id]);

  const reload = useCallback(async () => setShares(await call<Share[]>()), [call]);
  useEffect(() => { let live = true; void call<Share[]>().then((list) => { if (live) { setShares(list); setLoaded(true); } }).catch((reason) => { if (live) { setError(reason instanceof Error ? reason.message : 'Could not load the share link.'); setLoaded(true); } }); return () => { live = false; }; }, [call]);

  const active = shares.find((share) => share.state === 'ACTIVE');
  const showing = fresh && active && fresh.id === active.id ? fresh : null;
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong.'); } finally { setBusy(false); } };

  const turnOn = () => run(async () => { const made = await call<Made>('', 'POST', {}); setFresh({ id: made.id, url: made.url }); setCopied(false); await reload(); });
  const turnOff = () => run(async () => { if (!active || !window.confirm(t('sh.confirmOff'))) return; await call(`/${active.id}`, 'DELETE'); setFresh(null); await reload(); });
  const replace = () => run(async () => { if (!active || !window.confirm(t('sh.confirmReplace'))) return; const made = await call<Made>(`/${active.id}/regenerate`, 'POST'); setFresh({ id: made.id, url: made.url }); setCopied(false); await reload(); });
  const change = (patch: Record<string, unknown>) => run(async () => { if (!active) return; await call(`/${active.id}`, 'PATCH', patch); await reload(); });
  const copy = (url: string) => { void navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => setError(t('sh.copyFailed'))); };

  return <section className="document-studio__panel share-panel">
    <h2>{t('sh.title')} <span className="share-panel__badge">{t('sh.viewOnly')}</span></h2>
    <p>{t('sh.intro')}</p>
    {error && <p className="workspace-settings-status" role="alert">{error}</p>}
    {!loaded ? <p className="productivity-message">{t('ed.opening')}</p> : <>
      <label className="share-panel__switch"><input type="checkbox" role="switch" checked={Boolean(active)} disabled={readOnly || busy} onChange={() => void (active ? turnOff() : turnOn())} /><span><strong>{t('sh.publicLink')}</strong><small>{active ? t('sh.publicOn') : t('sh.publicOff')}</small></span></label>
      {active && <>
        {showing ? <div className="share-panel__fresh" role="status">
          <p>{t('sh.copyNow')}</p>
          <input readOnly value={showing.url} aria-label={t('sh.newLink')} onFocus={(event) => event.target.select()} />
          <button type="button" onClick={() => copy(showing.url)}>{copied ? t('sh.copied') : t('sh.copyLink')}</button>
        </div> : <p className="share-panel__note">{t('sh.addressHidden')}</p>}
        <dl className="share-panel__facts">
          <div><dt>{t('sh.access')}</dt><dd>{t('sh.viewOnly')} · {t('sh.noSignIn')}</dd></div>
          <div><dt>{t('sh.created')}</dt><dd>{t('sh.madeBy', { name: active.createdBy.displayName, when: when.format(new Date(active.createdAt)) })}</dd></div>
          <div><dt>{t('sh.opened')}</dt><dd>{t(active.viewCount === 1 ? 'sh.viewOne' : 'sh.viewMany', { n: active.viewCount })}{active.lastViewedAt ? t('sh.last', { when: when.format(new Date(active.lastViewedAt)) }) : ''}</dd></div>
        </dl>
        {!readOnly && <fieldset className="share-panel__options" disabled={busy}>
          <label className="share-panel__row"><span>{t('sh.expires')}</span><select value={nearestChoice(active.expiresAt)} onChange={(event) => void change({ expiresInDays: event.target.value ? Number(event.target.value) : null })}><option value="">{t('sh.never')}</option><option value="7">{t('sh.in7')}</option><option value="30">{t('sh.in30')}</option><option value="90">{t('sh.in90')}</option></select></label>
          {active.expiresAt && <p className="share-panel__note">{t('sh.expiresOn', { when: when.format(new Date(active.expiresAt)) }).replace(/^ · /, '')}</p>}
          <label className="share-panel__check"><input type="checkbox" checked={active.allowDownload} onChange={(event) => void change({ allowDownload: event.target.checked })} /><span><strong>{t('sh.allowDownload')}</strong><small>{t('sh.allowDownloadHint')}</small></span></label>
          <label className="share-panel__check"><input type="checkbox" checked={active.allowPrint} onChange={(event) => void change({ allowPrint: event.target.checked })} /><span><strong>{t('sh.allowPrint')}</strong><small>{t('sh.allowPrintHint')}</small></span></label>
          <label className="share-panel__check"><input type="checkbox" checked={active.includeEmbeds} onChange={(event) => void change({ includeEmbeds: event.target.checked })} /><span><strong>{t('sh.embeds')}</strong><small>{t('sh.embedsHint')}</small></span></label>
          <div className="share-panel__actions"><button type="button" onClick={() => void replace()}>{t('sh.replace')}</button><button type="button" className="is-danger" onClick={() => void turnOff()}>{t('sh.revoke')}</button></div>
        </fieldset>}
      </>}
      {!active && shares.length > 0 && <p className="share-panel__note">{t('sh.lastOff', { when: when.format(new Date((shares[0].revokedAt ?? shares[0].expiresAt ?? shares[0].createdAt))) })}</p>}
      <p className="share-panel__fineprint">{t('sh.fineprint')}</p>
    </>}
  </section>;
}
