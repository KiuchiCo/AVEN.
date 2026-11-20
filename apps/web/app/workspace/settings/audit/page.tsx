'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../../i18n';
import type { Key } from '../../../i18n/en';
import { useWorkspaceSession } from '../../workspace-shell';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
type Entry = { id: string; createdAt: string; entityType: string; entityId: string; message: string; actor: { id: string; displayName: string; email: string } };
type Person = { id: string; displayName: string };
const areas = ['PROJECT', 'TASK', 'TASK_COMMENT', 'MILESTONE', 'DOCUMENT', 'KNOWLEDGE', 'FILE', 'WORKFLOW', 'CALENDAR', 'MEMBER', 'WORKSPACE', 'WHITEBOARD', 'CHANNEL'];
const areaKeys: Record<string, Key> = { PROJECT: 'entity.project', TASK: 'entity.task', TASK_COMMENT: 'entity.comment', MILESTONE: 'entity.milestone', DOCUMENT: 'entity.document', KNOWLEDGE: 'entity.knowledge', FILE: 'entity.file', WORKFLOW: 'entity.workflow', CALENDAR: 'entity.calendar', MEMBER: 'ad.a.member', WORKSPACE: 'entity.workspace', WHITEBOARD: 'ad.a.whiteboard', CHANNEL: 'entity.channel' };
const cap = (value: string) => value.replace(/^./, (c) => c.toLocaleUpperCase());
const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

export default function AuditLogPage() {
  const t = useT();
  const nice = (value: string) => (areaKeys[value] ? cap(t(areaKeys[value])) : cap(value.replaceAll('_', ' ').toLowerCase()));
  const { workspace } = useWorkspaceSession();
  const { getToken } = useAuth();
  const [filters, setFilters] = useState({ entityType: '', actorId: '', from: '', to: '', q: '' });
  const [applied, setApplied] = useState(filters);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [locked, setLocked] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const allowed = workspace.role === 'OWNER' || workspace.role === 'ADMINISTRATOR';

  const query = useCallback((values: typeof filters, extra: Record<string, string> = {}) => new URLSearchParams(Object.entries({ ...values, ...extra }).filter(([, value]) => value)).toString(), []);
  const request = useCallback(async (path: string) => {
    const token = await getToken();
    return fetch(`${apiBase}/workspaces/${workspace.id}/audit${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  }, [getToken, workspace.id]);

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    void (async () => {
      const [response, peopleResponse] = await Promise.all([request(`?${query(applied)}`), request('/people')]).catch(() => [null, null] as const);
      if (!live || !response) return;
      if (response.status === 402) { setLocked((await response.json().catch(() => null))?.message ?? 'The audit log isn’t included in your plan.'); setLoading(false); return; }
      const body = await response.json().catch(() => null);
      if (!response.ok) { setError(body?.message ?? 'Could not load the audit log.'); setLoading(false); return; }
      setEntries(body.entries); setCursor(body.nextCursor); setError(''); setLoading(false);
      if (peopleResponse?.ok) setPeople(await peopleResponse.json());
    })();
    return () => { live = false; };
  }, [allowed, applied, query, request]);

  async function more() {
    if (!cursor) return;
    const response = await request(`?${query(applied, { cursor })}`); const body = await response.json().catch(() => null);
    if (!response.ok) { setError(body?.message ?? 'Could not load more.'); return; }
    setEntries((list) => [...list, ...body.entries]); setCursor(body.nextCursor);
  }
  async function download() {
    setError('');
    const response = await request(`/export?${query(applied)}`);
    if (!response.ok) { setError((await response.json().catch(() => null))?.message ?? 'Could not export.'); return; }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = 'aven-audit-log.csv'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  if (!allowed) return <section className="workspace-settings-page"><header><p className="workspace-page-eyebrow">{t('set.eyebrow')}</p><h1>{t('ad.title')}</h1><p>{t('ad.onlyAdmins')}</p></header></section>;
  return <section className="workspace-settings-page audit-page">
    <header><p className="workspace-page-eyebrow">{t('set.eyebrow')}</p><h1>{t('ad.title')}</h1><p>{t('ad.desc')}</p></header>
    {locked && <div className="workspace-settings-card"><div><h2>{t('ad.locked')}</h2><p>{locked}</p></div><Link className="workspace-settings-save" href="/workspace/settings">{t('ad.seePlans')}</Link></div>}
    {!locked && <>
      <form className="audit-filters" onSubmit={(event) => { event.preventDefault(); setLoading(true); setApplied(filters); }}>
        <label>{t('ad.area')}<select value={filters.entityType} onChange={(event) => setFilters({ ...filters, entityType: event.target.value })}><option value="">{t('ad.allAreas')}</option>{areas.map((area) => <option key={area} value={area}>{nice(area)}</option>)}</select></label>
        <label>{t('ad.person')}<select value={filters.actorId} onChange={(event) => setFilters({ ...filters, actorId: event.target.value })}><option value="">{t('ad.everyone')}</option>{people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label>
        <label>{t('ad.from')}<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
        <label>{t('ad.to')}<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
        <label>{t('ad.contains')}<input value={filters.q} maxLength={80} placeholder={t('ad.containsPh')} onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></label>
        <div className="audit-filters__actions"><button className="workspace-settings-save">{t('ad.apply')}</button><button type="button" onClick={() => void download()}>{t('ad.export')}</button></div>
      </form>
      {error && <p className="workspace-settings-status" role="alert">{error}</p>}
      {loading ? <p>{t('ad.loading')}</p> : entries.length === 0 ? <p className="workspace-settings-note">{t('ad.nothing')}</p> : <div className="audit-table"><table><thead><tr><th>{t('ad.colWhen')}</th><th>{t('ad.colPerson')}</th><th>{t('ad.colArea')}</th><th>{t('ad.colWhat')}</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td><time dateTime={entry.createdAt}>{when.format(new Date(entry.createdAt))}</time></td><td>{entry.actor.displayName}<small>{entry.actor.email}</small></td><td>{nice(entry.entityType)}</td><td>{entry.message}</td></tr>)}</tbody></table></div>}
      {cursor && <button className="chat-older" onClick={() => void more()}>{t('ad.loadMore')}</button>}
    </>}
  </section>;
}
