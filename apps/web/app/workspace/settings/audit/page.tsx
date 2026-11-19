'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useWorkspaceSession } from '../../workspace-shell';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
type Entry = { id: string; createdAt: string; entityType: string; entityId: string; message: string; actor: { id: string; displayName: string; email: string } };
type Person = { id: string; displayName: string };
const areas = ['PROJECT', 'TASK', 'TASK_COMMENT', 'MILESTONE', 'DOCUMENT', 'KNOWLEDGE', 'FILE', 'WORKFLOW', 'CALENDAR', 'MEMBER', 'WORKSPACE', 'WHITEBOARD', 'CHANNEL'];
const nice = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

export default function AuditLogPage() {
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

  if (!allowed) return <section className="workspace-settings-page"><header><p className="workspace-page-eyebrow">SETTINGS</p><h1>Audit log</h1><p>Only workspace owners and administrators can view the audit log.</p></header></section>;
  return <section className="workspace-settings-page audit-page">
    <header><p className="workspace-page-eyebrow">SETTINGS</p><h1>Audit log</h1><p>A record of who changed what in this workspace. Export it for your own records.</p></header>
    {locked && <div className="workspace-settings-card"><div><h2>Available on Business and Enterprise</h2><p>{locked}</p></div><Link className="workspace-settings-save" href="/workspace/settings">See plans</Link></div>}
    {!locked && <>
      <form className="audit-filters" onSubmit={(event) => { event.preventDefault(); setLoading(true); setApplied(filters); }}>
        <label>Area<select value={filters.entityType} onChange={(event) => setFilters({ ...filters, entityType: event.target.value })}><option value="">All areas</option>{areas.map((area) => <option key={area} value={area}>{nice(area)}</option>)}</select></label>
        <label>Person<select value={filters.actorId} onChange={(event) => setFilters({ ...filters, actorId: event.target.value })}><option value="">Everyone</option>{people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label>
        <label>From<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
        <label>To<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
        <label>Contains<input value={filters.q} maxLength={80} placeholder="Words in the entry" onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></label>
        <div className="audit-filters__actions"><button className="workspace-settings-save">Apply</button><button type="button" onClick={() => void download()}>Export CSV</button></div>
      </form>
      {error && <p className="workspace-settings-status" role="alert">{error}</p>}
      {loading ? <p>Loading…</p> : entries.length === 0 ? <p className="workspace-settings-note">Nothing matches these filters.</p> : <div className="audit-table"><table><thead><tr><th>When</th><th>Person</th><th>Area</th><th>What happened</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td><time dateTime={entry.createdAt}>{when.format(new Date(entry.createdAt))}</time></td><td>{entry.actor.displayName}<small>{entry.actor.email}</small></td><td>{nice(entry.entityType)}</td><td>{entry.message}</td></tr>)}</tbody></table></div>}
      {cursor && <button className="chat-older" onClick={() => void more()}>Load more</button>}
    </>}
  </section>;
}
