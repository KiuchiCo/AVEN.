'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/en';
import { useWorkspaceSession } from '../workspace-shell';

type ActivityEntry = { id: string; entityType: string; entityId: string; message: string; createdAt: string; actor: { displayName: string } };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const activityTypes = ['ALL', 'PROJECT', 'TASK', 'TASK_COMMENT', 'TASK_CHECKLIST', 'MILESTONE', 'DOCUMENT', 'KNOWLEDGE', 'CALENDAR'];
const filterKeys: Record<string, Key> = { ALL: 'act.f.all', PROJECT: 'act.f.project', TASK: 'act.f.task', TASK_COMMENT: 'act.f.taskComment', TASK_CHECKLIST: 'act.f.taskChecklist', MILESTONE: 'act.f.milestone', DOCUMENT: 'act.f.document', KNOWLEDGE: 'act.f.knowledge', CALENDAR: 'act.f.calendar' };
const entityKeys: Record<string, Key> = { PROJECT: 'entity.project', TASK: 'entity.task', TASK_COMMENT: 'entity.comment', TASK_CHECKLIST: 'entity.checklist', MILESTONE: 'entity.milestone', DOCUMENT: 'entity.document', KNOWLEDGE: 'entity.knowledge', CALENDAR: 'entity.calendar', WORKSPACE: 'entity.workspace' };
const destinations: Record<string, string> = { PROJECT: '/workspace/projects', TASK: '/workspace/tasks', MILESTONE: '/workspace/projects', DOCUMENT: '/workspace/documents', KNOWLEDGE: '/workspace/knowledge', CALENDAR: '/workspace/calendar', WORKSPACE: '/workspace/settings' };

export default function ActivityPage() {
  const { getToken } = useAuth();
  const t = useT();
  const entityLabel = (type: string) => entityKeys[type] ? t(entityKeys[type]) : type.replaceAll('_', ' ').toLowerCase();
  const { workspace } = useWorkspaceSession();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await getToken();
        if (!token || !apiBase) throw new Error('AVEN could not connect to the API. Check your local API setup.');
        const response = await fetch(`${apiBase}/workspaces/${workspace.id}/activity`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('Could not load workspace activity.');
        const savedEntries = await response.json() as ActivityEntry[];
        if (!cancelled) setEntries(savedEntries);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load workspace activity.');
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [getToken, workspace.id]);

  const visibleEntries = useMemo(() => filter === 'ALL' ? entries : entries.filter((entry) => entry.entityType === filter), [entries, filter]);

  return (
    <div className="workspace-section-page activity-page">
      <p className="workspace-eyebrow">{t('act.eyebrow', { name: workspace.name })}</p>
      <h1>{t('nav.activity')}</h1>
      <p className="workspace-section-page__description">{t('act.desc')}</p>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <section className="activity-feed" aria-labelledby="activity-feed-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">{t('act.latest')}</p><h2 id="activity-feed-title">{t('home.recentActivity')}</h2></div><span>{t('act.count', { n: entries.length })}</span></div>
        <div className="activity-filter" role="group" aria-label={t('act.filterAria')}>{activityTypes.map((type) => <button key={type} type="button" aria-pressed={filter === type} className={filter === type ? 'is-active' : ''} onClick={() => setFilter(type)}>{t(filterKeys[type])}</button>)}</div>
        {loading ? <p className="productivity-message">{t('act.loading')}</p> : visibleEntries.length === 0 ? <div className="activity-empty"><span aria-hidden="true">◷</span><h3>{entries.length ? t('act.emptyCat') : t('act.emptyAll')}</h3><p>{t('act.emptyHint')}</p><Link href="/workspace/projects">{t('act.goProjects')} <span aria-hidden="true">→</span></Link></div> : (
          <ol className="activity-feed__list">{visibleEntries.map((entry) => <li key={entry.id}><span className={`activity-feed__icon activity-feed__icon--${entry.entityType.toLowerCase()}`} aria-hidden="true">{entry.entityType.startsWith('TASK') ? '✓' : entry.entityType === 'DOCUMENT' ? '▤' : entry.entityType === 'CALENDAR' ? '▦' : entry.entityType === 'MILESTONE' ? '◆' : entry.entityType === 'KNOWLEDGE' ? '⌕' : '◇'}</span><div className="activity-feed__copy"><p><strong>{entry.actor.displayName}</strong> {entry.message}</p><small>{entityLabel(entry.entityType)} · {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))}</small></div><Link href={entry.entityType === 'TASK_COMMENT' || entry.entityType === 'TASK_CHECKLIST' ? `/workspace/tasks/${entry.entityId}` : destinations[entry.entityType] ?? '/workspace'} aria-label={t('act.openArea', { type: entityLabel(entry.entityType) })}>→</Link></li>)}</ol>
        )}
      </section>
    </div>
  );
}
