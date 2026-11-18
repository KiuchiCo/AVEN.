'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspaceSession } from '../workspace-shell';

type ActivityEntry = { id: string; entityType: string; entityId: string; message: string; createdAt: string; actor: { displayName: string } };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const activityTypes = ['ALL', 'PROJECT', 'TASK', 'TASK_COMMENT', 'TASK_CHECKLIST', 'MILESTONE', 'DOCUMENT', 'KNOWLEDGE', 'CALENDAR'];
const destinations: Record<string, string> = { PROJECT: '/workspace/projects', TASK: '/workspace/tasks', MILESTONE: '/workspace/projects', DOCUMENT: '/workspace/documents', KNOWLEDGE: '/workspace/knowledge', CALENDAR: '/workspace/calendar', WORKSPACE: '/workspace/settings' };

export default function ActivityPage() {
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API. Check your local API setup.');
    const response = await fetch(`${apiBase}/workspaces/${workspace.id}/activity`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Could not load workspace activity.');
    setEntries(await response.json() as ActivityEntry[]);
  }, [getToken, workspace.id]);

  useEffect(() => {
    let cancelled = false;
    void reload().catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load workspace activity.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  const visibleEntries = useMemo(() => filter === 'ALL' ? entries : entries.filter((entry) => entry.entityType === filter), [entries, filter]);

  return (
    <div className="workspace-section-page activity-page">
      <p className="workspace-eyebrow">YOUR WORKSPACE · {workspace.name}</p>
      <h1>Activity</h1>
      <p className="workspace-section-page__description">A shared record of changes across projects, tasks, documents, Knowledge, and your calendar.</p>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <section className="activity-feed" aria-labelledby="activity-feed-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">LATEST WORKSPACE CHANGES</p><h2 id="activity-feed-title">Recent activity</h2></div><span>{entries.length} recent</span></div>
        <div className="activity-filter" role="group" aria-label="Filter activity">{activityTypes.map((type) => <button key={type} type="button" aria-pressed={filter === type} className={filter === type ? 'is-active' : ''} onClick={() => setFilter(type)}>{type === 'ALL' ? 'All' : type === 'TASK_COMMENT' ? 'Task comments' : type === 'TASK_CHECKLIST' ? 'Task checklists' : `${type[0]}${type.slice(1).toLowerCase()}s`}</button>)}</div>
        {loading ? <p className="productivity-message">Loading activity…</p> : visibleEntries.length === 0 ? <div className="activity-empty"><span aria-hidden="true">◷</span><h3>{entries.length ? 'No activity in this category yet.' : 'Your activity will appear here.'}</h3><p>As you make changes in AVEN, this feed will keep a record of what happened.</p><Link href="/workspace/projects">Go to projects <span aria-hidden="true">→</span></Link></div> : (
          <ol className="activity-feed__list">{visibleEntries.map((entry) => <li key={entry.id}><span className={`activity-feed__icon activity-feed__icon--${entry.entityType.toLowerCase()}`} aria-hidden="true">{entry.entityType.startsWith('TASK') ? '✓' : entry.entityType === 'DOCUMENT' ? '▤' : entry.entityType === 'CALENDAR' ? '▦' : entry.entityType === 'MILESTONE' ? '◆' : entry.entityType === 'KNOWLEDGE' ? '⌕' : '◇'}</span><div className="activity-feed__copy"><p><strong>{entry.actor.displayName}</strong> {entry.message}</p><small>{entry.entityType.replaceAll('_', ' ').toLowerCase()} · {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))}</small></div><Link href={entry.entityType === 'TASK_COMMENT' || entry.entityType === 'TASK_CHECKLIST' ? `/workspace/tasks/${entry.entityId}` : destinations[entry.entityType] ?? '/workspace'} aria-label={`Open ${entry.entityType.toLowerCase()} area`}>→</Link></li>)}</ol>
        )}
      </section>
    </div>
  );
}
