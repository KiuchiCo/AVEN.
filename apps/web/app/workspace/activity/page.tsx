'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/en';
import { useWorkspaceSession } from '../workspace-shell';
import { Icon, type IconName } from '../home-icons';
import { EmptyState, PageHeader, Panel, Pill, StatCard, StatRow } from '../ui';
import { ago } from '../relative-time';

type ActivityEntry = { id: string; entityType: string; entityId: string; message: string; createdAt: string; actor: { id?: string; displayName: string } };
const typeIcons: Record<string, IconName> = { PROJECT: 'layers', TASK: 'tasks', TASK_COMMENT: 'chat', TASK_CHECKLIST: 'tasks', MILESTONE: 'flag', DOCUMENT: 'doc', KNOWLEDGE: 'doc', CALENDAR: 'calendar', WORKSPACE: 'users' };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const activityTypes = ['ALL', 'PROJECT', 'TASK', 'TASK_COMMENT', 'TASK_CHECKLIST', 'MILESTONE', 'DOCUMENT', 'KNOWLEDGE', 'CALENDAR', 'MEMBERS'];
const filterKeys: Record<string, Key> = { ALL: 'act.f.all', PROJECT: 'act.f.project', TASK: 'act.f.task', TASK_COMMENT: 'act.f.taskComment', TASK_CHECKLIST: 'act.f.taskChecklist', MILESTONE: 'act.f.milestone', DOCUMENT: 'act.f.document', KNOWLEDGE: 'act.f.knowledge', CALENDAR: 'act.f.calendar', MEMBERS: 'act.f.members' };
const entityKeys: Record<string, Key> = { PROJECT: 'entity.project', TASK: 'entity.task', TASK_COMMENT: 'entity.comment', TASK_CHECKLIST: 'entity.checklist', MILESTONE: 'entity.milestone', DOCUMENT: 'entity.document', KNOWLEDGE: 'entity.knowledge', CALENDAR: 'entity.calendar', WORKSPACE: 'entity.workspace' };
const destinations: Record<string, string> = { PROJECT: '/workspace/projects', TASK: '/workspace/tasks', MILESTONE: '/workspace/projects', DOCUMENT: '/workspace/documents', KNOWLEDGE: '/workspace/knowledge', CALENDAR: '/workspace/calendar', WORKSPACE: '/workspace/settings' };

export default function ActivityPage() {
  const [nowMs] = useState(() => Date.now());
  const { getToken } = useAuth();
  const t = useT();
  const entityLabel = (type: string) => entityKeys[type] ? t(entityKeys[type]) : type.replaceAll('_', ' ').toLowerCase();
  const { workspace, user } = useWorkspaceSession();
  const [scope, setScope] = useState<'ALL' | 'MINE'>('ALL');
  const [member, setMember] = useState('');
  const [range, setRange] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH'>('ALL');
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

  const members = useMemo(() => [...new Set(entries.map((entry) => entry.actor.displayName))].sort(), [entries]);
  const inRange = useMemo(() => { const days = range === 'TODAY' ? 1 : range === 'WEEK' ? 7 : range === 'MONTH' ? 30 : 0; if (!days) return entries; const since = range === 'TODAY' ? new Date(new Date(nowMs).setHours(0, 0, 0, 0)).getTime() : nowMs - days * 86_400_000; return entries.filter((entry) => Date.parse(entry.createdAt) >= since); }, [entries, range, nowMs]);
  const scoped = useMemo(() => inRange.filter((entry) => (scope === 'ALL' || entry.actor.displayName === user.displayName) && (!member || entry.actor.displayName === member)), [inRange, member, scope, user.displayName]);
  const visibleEntries = useMemo(() => filter === 'ALL' ? scoped : filter === 'MEMBERS' ? scoped.filter((entry) => entry.entityType === 'WORKSPACE') : scoped.filter((entry) => entry.entityType === filter), [filter, scoped]);
  const count = (...types: string[]) => scoped.filter((entry) => types.includes(entry.entityType)).length;

  return (
    <div className="workspace-section-page activity-page">
      <PageHeader eyebrow={t('act.eyebrow', { name: workspace.name })} title={t('nav.activity')} description={t('act.desc')} />
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <StatRow columns={5} label={t('act.count', { n: scoped.length })}>
        <StatCard icon="hash" value={scoped.length} label={t('act.s.total')} />
        <StatCard icon="doc" value={count('DOCUMENT')} label={t('act.s.documents')} />
        <StatCard icon="tasks" value={count('TASK', 'TASK_COMMENT', 'TASK_CHECKLIST')} label={t('act.s.tasks')} />
        <StatCard icon="folder" value={count('PROJECT', 'MILESTONE')} label={t('act.s.projects')} />
        <StatCard icon="calendar" value={count('CALENDAR')} label={t('act.s.calendar')} />
      </StatRow>
      <div className="rd-grid rd-grid--aside">
        <div>
          <section className="activity-feed rd-panel" aria-labelledby="activity-feed-title">
            <div className="rd-panel__head"><div className="rd-panel__titles"><h2 id="activity-feed-title">{t('home.recentActivity')}</h2></div><span className="rd-muted">{t('act.count', { n: scoped.length })}</span></div>
            <div className="activity-filter rd-tabs rd-tabs--small" role="group" aria-label={t('act.filterAria')}>{activityTypes.map((type) => <button key={type} type="button" aria-pressed={filter === type} className={filter === type ? 'is-active' : ''} onClick={() => setFilter(type)}>{t(filterKeys[type])}</button>)}</div>
            {loading ? <p className="productivity-message">{t('act.loading')}</p> : visibleEntries.length === 0 ? <EmptyState art="folder" compact title={entries.length ? t('act.emptyCat') : t('act.emptyAll')} text={t('act.emptyHint')}><Link className="rd-btn rd-btn--soft" href="/workspace/projects">{t('act.goProjects')} <span aria-hidden="true">→</span></Link></EmptyState> : (
              <ol className="activity-feed__list rd-activity">{visibleEntries.map((entry) => <li key={entry.id}>
                <span className="rd-tile rd-tile--round rd-tile--small" aria-hidden="true"><Icon name={typeIcons[entry.entityType] ?? 'sparkle'} size={18} /></span>
                <div className="activity-feed__copy"><p><strong>{entry.actor.displayName}</strong> {entry.message}</p></div>
                <Pill>{entityLabel(entry.entityType).replace(/^./, (c) => c.toLocaleUpperCase())}</Pill>
                <time dateTime={entry.createdAt} title={new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))}>{ago(entry.createdAt)}</time>
                <Link className="rd-iconbtn" href={entry.entityType === 'TASK_COMMENT' || entry.entityType === 'TASK_CHECKLIST' ? `/workspace/tasks/${entry.entityId}` : destinations[entry.entityType] ?? '/workspace'} aria-label={t('act.openArea', { type: entityLabel(entry.entityType) })}><Icon name="arrow" size={18} /></Link>
              </li>)}</ol>
            )}
          </section>
        </div>
        <aside className="rd-rail">
          <Panel icon="filter" title={t('act.filterTitle')} id="act-filter" className="rd-rail__card">
            <div className="rd-formstack">
              <label className="rd-field">{t('act.scope')}<select value={scope} onChange={(event) => setScope(event.target.value as 'ALL' | 'MINE')}><option value="ALL">{t('act.scope.all')}</option><option value="MINE">{t('act.scope.mine')}</option></select></label>
              <label className="rd-field">{t('act.member')}<select value={member} onChange={(event) => setMember(event.target.value)}><option value="">{t('act.allMembers')}</option>{members.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
              <label className="rd-field">{t('act.range')}<select value={range} onChange={(event) => setRange(event.target.value as typeof range)}><option value="ALL">{t('act.range.all')}</option><option value="TODAY">{t('act.range.today')}</option><option value="WEEK">{t('act.range.week')}</option><option value="MONTH">{t('act.range.month')}</option></select></label>
            </div>
          </Panel>
          <Panel icon="sparkle" title={t('act.insights')} id="act-insights" className="rd-rail__card">
            <ul className="rd-insights">
              <li><Icon name="doc" size={20} /><strong>{count('DOCUMENT')}</strong><span>{t('act.i.documents')}</span></li>
              <li><Icon name="tasks" size={20} /><strong>{count('TASK', 'TASK_COMMENT', 'TASK_CHECKLIST')}</strong><span>{t('act.i.tasks')}</span></li>
              <li><Icon name="folder" size={20} /><strong>{count('PROJECT', 'MILESTONE')}</strong><span>{t('act.i.projects')}</span></li>
              <li><Icon name="calendar" size={20} /><strong>{count('CALENDAR')}</strong><span>{t('act.i.calendar')}</span></li>
              <li><Icon name="users" size={20} /><strong>{count('WORKSPACE')}</strong><span>{t('act.i.members')}</span></li>
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
