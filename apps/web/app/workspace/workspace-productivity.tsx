'use client';

import { useAuth } from '@clerk/nextjs';
import { groupUpdates, type Update } from './inbox-groups';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useT } from '../i18n';
import type { Key } from '../i18n/en';
import { useWorkspaceSession } from './workspace-shell';
import { TaskLabelFilter, TaskLabels } from './task-labels';
import { TaskBadges } from './task-badges';
import { Icon, type IconName } from './home-icons';
import { EmptyState, PageHeader, Panel, PillTabs, Pill, StatCard, StatRow } from './ui';
import { ago } from './relative-time';

type TaskRecord = {
  id: string;
  title: string;
  status: string;
  priority: string;
  labels: string[];
  dueAt: string | null;
  project: { id: string; name: string } | null;
  events: { id: string; title: string; startsAt: string }[];
  parent?: { id: string; title: string } | null;
  subtasks?: { id: string; status: string }[];
  recurrence?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;
  assignee?: { id: string } | null;
};
type ProjectRecord = { id: string; name: string; status: string };

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const taskStatuses: { value: string; label: Key }[] = [
  { value: 'TODO', label: 'status.todo' },
  { value: 'IN_PROGRESS', label: 'status.inProgress' },
  { value: 'IN_REVIEW', label: 'status.inReview' },
  { value: 'COMPLETED', label: 'status.completed' },
  { value: 'CANCELLED', label: 'status.cancelled' },
];
const entityKey = (type: string): Key | null => ({ PROJECT: 'entity.project', TASK: 'entity.task', TASK_COMMENT: 'entity.comment', TASK_CHECKLIST: 'entity.checklist', MILESTONE: 'entity.milestone', DOCUMENT: 'entity.document', KNOWLEDGE: 'entity.knowledge', FILE: 'entity.file', CHANNEL: 'entity.channel', WORKFLOW: 'entity.workflow', CALENDAR: 'entity.calendar', WORKSPACE: 'entity.workspace' } as Record<string, Key>)[type] ?? null;

function useWorkspaceProductivity() {
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API. Check your local API setup.');
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(body?.message ?? 'AVEN could not complete that request.');
    }
    return response.json();
  }, [getToken]);

  const reload = useCallback(async () => {
    const [taskRows, projectRows] = await Promise.all([
      request(`/workspaces/${workspace.id}/tasks`),
      request(`/workspaces/${workspace.id}/projects`),
    ]) as [TaskRecord[], ProjectRecord[]];
    setTasks(taskRows);
    setProjects(projectRows);
  }, [request, workspace.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try { await reload(); }
      catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load your workspace.'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [reload]);

  const updateStatus = useCallback(async (taskId: string, status: string) => {
    setSavingId(taskId); setError('');
    try {
      await request(`/workspaces/${workspace.id}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this task.'); }
    finally { setSavingId(''); }
  }, [reload, request, workspace.id]);

  return { tasks, projects, loading, savingId, error, updateStatus };
}

const labelColours = ['#d9776a', '#7fa36f', '#7c78c8', '#d9a24f', '#5f9bc4', '#b07aa6'];
const labelColour = (label: string) => { let hash = 0; for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return labelColours[hash % labelColours.length]; };
const priorityTone = (priority: string) => (priority === 'URGENT' || priority === 'HIGH' ? 'red' : priority === 'MEDIUM' ? 'amber' : 'green') as 'red' | 'amber' | 'green';

type TaskGroupBy = 'DUE' | 'PROJECT' | 'PRIORITY' | 'STATUS';

export function MyTasksWorkspace() {
  const t = useT();
  const { user } = useWorkspaceSession();
  const { tasks, projects, loading, savingId, error, updateStatus } = useWorkspaceProductivity();
  const [filter, setFilter] = useState('OPEN');
  const [tab, setTab] = useState<'ALL' | 'MINE'>('ALL');
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<TaskGroupBy>('DUE');
  const [projectFilter, setProjectFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [query, setQuery] = useState('');
  const urlLabel = useSyncExternalStore(
    (notify) => { window.addEventListener('popstate', notify); return () => window.removeEventListener('popstate', notify); },
    () => new URLSearchParams(window.location.search).get('label')?.trim().toLocaleLowerCase() ?? '',
    () => '',
  );
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const labelFilter = selectedLabel ?? urlLabel;
  const allLabels = useMemo(() => [...new Set(tasks.flatMap((task) => task.labels))].sort(), [tasks]);
  const todayKey = localDayKey(new Date());
  const weekEnd = new Date(); weekEnd.setHours(12, 0, 0, 0); weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndKey = localDayKey(weekEnd);
  const open = tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED');
  const dayOf = (task: TaskRecord) => task.dueAt?.slice(0, 10) ?? null;
  const stats = { open: open.length, today: open.filter((task) => dayOf(task) === todayKey).length, week: open.filter((task) => { const day = dayOf(task); return day !== null && day > todayKey && day <= weekEndKey; }).length, high: open.filter((task) => task.priority === 'HIGH' || task.priority === 'URGENT').length };
  const visibleTasks = useMemo(() => {
    let matching = labelFilter ? tasks.filter((task) => task.labels.includes(labelFilter)) : tasks;
    if (tab === 'MINE') matching = matching.filter((task) => task.assignee?.id === user.id);
    if (projectFilter) matching = matching.filter((task) => task.project?.id === projectFilter);
    if (priorityFilter) matching = matching.filter((task) => task.priority === priorityFilter);
    if (query.trim()) { const needle = query.trim().toLocaleLowerCase(); matching = matching.filter((task) => task.title.toLocaleLowerCase().includes(needle) || task.labels.some((label) => label.includes(needle))); }
    if (filter === 'ALL') return matching;
    if (filter === 'COMPLETED') return matching.filter((task) => task.status === 'COMPLETED');
    return matching.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED');
  }, [filter, labelFilter, priorityFilter, projectFilter, query, tab, tasks, user.id]);
  const groups = useMemo(() => {
    const rank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const sorted = [...visibleTasks].sort((a, b) => (dayOf(a) ?? '9999').localeCompare(dayOf(b) ?? '9999') || (rank[a.priority] ?? 4) - (rank[b.priority] ?? 4));
    const order: { key: string; title: string; items: TaskRecord[] }[] = [];
    const put = (key: string, title: string, task: TaskRecord) => { let group = order.find((entry) => entry.key === key); if (!group) { group = { key, title, items: [] }; order.push(group); } group.items.push(task); };
    for (const task of sorted) {
      const day = dayOf(task);
      if (groupBy === 'PROJECT') put(task.project?.id ?? '_', task.project?.name ?? t('tasks.gr.noproject'), task);
      else if (groupBy === 'PRIORITY') put(task.priority, t(`prio.${task.priority.toLowerCase()}` as Key).replace(/^./, (c) => c.toLocaleUpperCase()), task);
      else if (groupBy === 'STATUS') put(task.status, t(taskStatuses.find((status) => status.value === task.status)?.label ?? 'status.todo'), task);
      else if (!day) put('5', t('tasks.gr.nodate'), task);
      else if (day < todayKey) put('1', t('tasks.gr.overdue'), task);
      else if (day === todayKey) put('2', t('tasks.gr.today'), task);
      else if (day <= weekEndKey) put('3', t('tasks.gr.week'), task);
      else put('4', t('tasks.gr.upcoming'), task);
    }
    if (groupBy === 'DUE') order.sort((a, b) => a.key.localeCompare(b.key));
    if (groupBy === 'PRIORITY') order.sort((a, b) => (rank[a.key] ?? 4) - (rank[b.key] ?? 4));
    return order;
  }, [groupBy, t, todayKey, visibleTasks, weekEndKey]);
  const focusTask = [...open].sort((a, b) => (dayOf(a) ?? '9999').localeCompare(dayOf(b) ?? '9999') || ((a.priority === 'URGENT' ? 0 : a.priority === 'HIGH' ? 1 : 2) - (b.priority === 'URGENT' ? 0 : b.priority === 'HIGH' ? 1 : 2)))[0];
  const labelCounts = allLabels.map((label) => ({ label, count: tasks.filter((task) => task.labels.includes(label)).length }));
  const dateOf = (value: string) => new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${value.slice(0, 10)}T12:00:00`));

  return (
    <div className="workspace-section-page task-list-page">
      <PageHeader eyebrow={t('tasks.eyebrow')} title={t('nav.tasks')} description={t('tasks.desc')} />
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <div className="rd-grid rd-grid--aside">
        <div>
          <StatRow label={t('inbox.summaryAria')}>
            <StatCard icon="tasks" value={loading ? '—' : stats.open} label={t('tasks.s.open')} />
            <StatCard icon="calendar" value={loading ? '—' : stats.today} label={t('tasks.s.today')} tone="bronze" />
            <StatCard icon="flag" value={loading ? '—' : stats.week} label={t('tasks.s.week')} tone="violet" />
            <StatCard icon="bolt" value={loading ? '—' : stats.high} label={t('tasks.s.high')} tone="red" />
          </StatRow>
          <section className="task-list-panel rd-panel" aria-labelledby="my-tasks-title">
            <h2 id="my-tasks-title" className="visually-hidden">{t('tasks.all')}</h2>
            <div className="rd-listbar">
              <PillTabs label={t('tasks.tabsAria')} value={tab} onChange={setTab} items={[{ key: 'ALL', label: t('tasks.tab.all') }, { key: 'MINE', label: t('tasks.tab.mine') }]} />
              <div className="rd-listbar__tools">
                <label className="rd-inline">{t('tasks.groupBy')}<select className="rd-select" value={groupBy} onChange={(event) => setGroupBy(event.target.value as TaskGroupBy)}><option value="DUE">{t('tasks.g.due')}</option><option value="PROJECT">{t('tasks.g.project')}</option><option value="PRIORITY">{t('tasks.g.priority')}</option><option value="STATUS">{t('tasks.g.status')}</option></select></label>
                <div className="rd-viewswitch" role="group" aria-label={t('tasks.views')}>
                  <button type="button" className="is-active" aria-pressed="true" aria-label={t('tasks.v.list')}><Icon name="list" size={18} /></button>
                  <Link href="/workspace/projects" aria-label={t('tasks.v.board')}><Icon name="columns" size={18} /></Link>
                  <Link href="/workspace/calendar" aria-label={t('tasks.v.calendar')}><Icon name="calendar" size={18} /></Link>
                </div>
              </div>
            </div>
            <div className="rd-filterbar">
              <label className="rd-inline">{t('tasks.f.status')}<select className="rd-select" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="OPEN">{t('tasks.f.open')}</option><option value="ALL">{t('tasks.f.all')}</option><option value="COMPLETED">{t('tasks.f.completed')}</option></select></label>
              <label className="rd-inline">{t('tasks.f.project')}<select className="rd-select" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="">{t('tasks.allProjects')}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
              <label className="rd-inline">{t('tasks.f.priority')}<select className="rd-select" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="">{t('tasks.allPriorities')}</option>{['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((value) => <option key={value} value={value}>{t(`prio.${value.toLowerCase()}` as Key).replace(/^./, (c) => c.toLocaleUpperCase())}</option>)}</select></label>
              <TaskLabelFilter labels={allLabels} value={labelFilter} onChange={setSelectedLabel} />
              <div className="rd-search rd-filterbar__search"><Icon name="search" size={18} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('tasks.search')} aria-label={t('tasks.search')} /></div>
            </div>
            {loading ? <p className="productivity-message">{t('tasks.loading')}</p> : visibleTasks.length === 0 ? (
              <EmptyState art="check" title={filter === 'COMPLETED' ? t('tasks.emptyDone') : t('tasks.emptyClear')} text={filter === 'COMPLETED' ? t('tasks.emptyDoneHint') : t('tasks.emptyClearHint')}><Link className="rd-btn rd-btn--soft" href="/workspace/projects">{t('tasks.openProjects')} <span aria-hidden="true">→</span></Link></EmptyState>
            ) : (
              <div className="rd-groups">{groups.map((group) => <section key={group.key} className={`rd-group${collapsedGroups.includes(group.key) ? ' is-collapsed' : ''}`}><h3><button type="button" className="rd-group__toggle" aria-expanded={!collapsedGroups.includes(group.key)} onClick={() => setCollapsedGroups((current) => (current.includes(group.key) ? current.filter((key) => key !== group.key) : [...current, group.key]))}><Icon name="chevron" size={18} />{group.title}<span>{group.items.length}</span></button></h3>
                {!collapsedGroups.includes(group.key) && group.items.map((task) => <article className={`rd-taskrow${dayOf(task) && dayOf(task)! < todayKey && task.status !== 'COMPLETED' ? ' is-overdue' : ''}${task.status === 'COMPLETED' ? ' is-done' : ''}`} key={task.id}>
                  <input type="checkbox" className="rd-check" checked={task.status === 'COMPLETED'} disabled={savingId === task.id} aria-label={t('tasks.markDone', { title: task.title })} onChange={(event) => void updateStatus(task.id, event.target.checked ? 'COMPLETED' : 'TODO')} />
                  <div className="rd-taskrow__main"><h4><Link href={`/workspace/tasks/${task.id}`}>{task.title}</Link><TaskBadges task={task} /></h4><TaskLabels labels={task.labels} compact />{task.events.length > 0 && <small>{task.events.length === 1 ? t('tasks.scheduled') : t('tasks.events', { n: task.events.length })}</small>}</div>
                  {task.project ? <Link className="rd-projectpill" href="/workspace/projects"><Icon name="layers" size={15} />{task.project.name}</Link> : <span />}
                  <Pill tone={priorityTone(task.priority)}><i className="rd-dot" />{t(`prio.${task.priority.toLowerCase()}` as Key).replace(/^./, (c) => c.toLocaleUpperCase())}</Pill>
                  <span className="rd-due">{task.dueAt ? <time dateTime={task.dueAt}><Icon name="calendar" size={16} />{dayOf(task) === todayKey ? t('tasks.gr.today') : dateOf(task.dueAt)}</time> : <span className="rd-due--none">—</span>}</span>
                  <details className="rd-menu"><summary className="rd-iconbtn" aria-label={t('tasks.rowActions', { title: task.title })}><Icon name="more" size={20} /></summary>
                    <div className="rd-menu__list"><Link href={`/workspace/tasks/${task.id}`}><Icon name="arrow" size={16} />{t('tasks.openTask')}</Link>
                      <label className="rd-menu__field">{t('tasks.changeStatus')}<select value={task.status} disabled={savingId === task.id} aria-label={t('tasks.statusFor', { title: task.title })} onChange={(event) => void updateStatus(task.id, event.target.value)}>{taskStatuses.map((status) => <option key={status.value} value={status.value}>{t(status.label)}</option>)}</select></label></div></details>
                </article>)}
              </section>)}</div>
            )}
          </section>
        </div>
        <aside className="rd-rail" aria-label={t('tasks.quick')}>
          <Panel icon="sparkle" title={t('tasks.focus')} subtitle={t('tasks.focusHint')} id="focus" className="rd-rail__card">
            {focusTask ? <><Link className="rd-btn rd-btn--block" href={`/workspace/tasks/${focusTask.id}`}><Icon name="play" size={18} />{t('tasks.focusMode')}</Link><p className="rd-rail__note">{t('tasks.focusNext', { title: focusTask.title })}</p></> : <p className="rd-rail__note">{t('tasks.focusNone')}</p>}
          </Panel>
          <Panel icon="tag" title={t('tasks.myLabels')} id="mylabels" className="rd-rail__card" actions={<Link className="rd-iconbtn" href="/workspace/labels" aria-label={t('tasks.addLabel')}><Icon name="plus" size={20} /></Link>}>
            {labelCounts.length === 0 ? <p className="rd-rail__note">{t('tasks.noLabels')}</p> : <ul className="rd-labellist">{labelCounts.map(({ label, count }) => <li key={label}><button type="button" aria-pressed={labelFilter === label} className={labelFilter === label ? 'is-active' : ''} onClick={() => setSelectedLabel(labelFilter === label ? '' : label)}><i style={{ background: labelColour(label) }} />{label}<small>{count}</small></button></li>)}</ul>}
          </Panel>
          <Panel icon="bolt" title={t('tasks.quick')} id="quick" className="rd-rail__card">
            <div className="rd-quick"><Link className="rd-btn rd-btn--soft" href="/workspace/projects"><Icon name="plus" size={18} />{t('tasks.q.new')}</Link><Link className="rd-btn rd-btn--soft" href="/workspace/calendar"><Icon name="calendar" size={18} />{t('tasks.q.schedule')}</Link><Link className="rd-btn rd-btn--soft" href="/workspace/projects"><Icon name="arrow" size={18} />{t('tasks.q.template')}</Link></div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

type InboxTab = 'ALL' | 'MENTIONS' | 'ASSIGNMENTS' | 'PROJECTS' | 'SYSTEM';
type InboxFilter = 'ATTENTION' | 'OVERDUE' | 'DUE_SOON' | 'HIGH_PRIORITY' | 'ALL_OPEN';

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function InboxWorkspace() {
  const [nowMs] = useState(() => Date.now());
  const t = useT();
  const { tasks, projects, loading, savingId, error, updateStatus } = useWorkspaceProductivity();
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [updates, setUpdates] = useState<Update[]>([]);
  const [updatesError, setUpdatesError] = useState('');
  const [updatesBusy, setUpdatesBusy] = useState(false);
  const [filter, setFilter] = useState<InboxFilter>('ATTENTION');
  const [tab, setTab] = useState<InboxTab>('ALL');
  const [labelFilter, setLabelFilter] = useState('');
  const allLabels = useMemo(() => [...new Set(tasks.flatMap((task) => task.labels))].sort(), [tasks]);
  const todayKey = localDayKey(new Date());
  const weekEnd = new Date(); weekEnd.setHours(12, 0, 0, 0); weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndKey = localDayKey(weekEnd);
  const openTasks = tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED');
  const overdueTasks = openTasks.filter((task) => task.dueAt && task.dueAt.slice(0, 10) < todayKey);
  const dueSoonTasks = openTasks.filter((task) => task.dueAt && task.dueAt.slice(0, 10) >= todayKey && task.dueAt.slice(0, 10) <= weekEndKey);
  const highPriorityTasks = openTasks.filter((task) => task.priority === 'HIGH' || task.priority === 'URGENT');
  const attentionTasks = openTasks.filter((task) => overdueTasks.includes(task) || dueSoonTasks.includes(task) || highPriorityTasks.includes(task));
  const filteredTasks = (filter === 'OVERDUE' ? overdueTasks : filter === 'DUE_SOON' ? dueSoonTasks : filter === 'HIGH_PRIORITY' ? highPriorityTasks : filter === 'ALL_OPEN' ? openTasks : attentionTasks)
    .slice().sort((a, b) => {
      const dateA = a.dueAt?.slice(0, 10) ?? '9999-12-31'; const dateB = b.dueAt?.slice(0, 10) ?? '9999-12-31';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const rank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return (rank[a.priority] ?? 4) - (rank[b.priority] ?? 4);
    });
  const visibleFilteredTasks = labelFilter ? filteredTasks.filter((task) => task.labels.includes(labelFilter)) : filteredTasks;
  const filters: { key: InboxFilter; label: string; count: number }[] = [
    { key: 'ATTENTION', label: t('inbox.f.attention'), count: attentionTasks.length },
    { key: 'OVERDUE', label: t('inbox.f.overdue'), count: overdueTasks.length },
    { key: 'DUE_SOON', label: t('inbox.f.dueSoon'), count: dueSoonTasks.length },
    { key: 'HIGH_PRIORITY', label: t('inbox.f.highPriority'), count: highPriorityTasks.length },
    { key: 'ALL_OPEN', label: t('inbox.f.allOpen'), count: openTasks.length },
  ];

  const fetchUpdates = useCallback(async () => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API.');
    const response = await fetch(`${apiBase}/workspaces/${workspace.id}/activity/inbox`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load workspace updates.');
    return response.json();
  }, [getToken, workspace.id]);

  const reloadUpdates = useCallback(async () => setUpdates(await fetchUpdates()), [fetchUpdates]);

  useEffect(() => {
    let cancelled = false;
    void fetchUpdates().then((rows) => { if (!cancelled) setUpdates(rows); }).catch((reason) => { if (!cancelled) setUpdatesError(reason instanceof Error ? reason.message : 'Could not load workspace updates.'); });
    return () => { cancelled = true; };
  }, [fetchUpdates]);

  async function updateReadState(activityIds: string[], read: boolean) {
    setUpdatesBusy(true); setUpdatesError('');
    try {
      const token = await getToken();
      const responses = await Promise.all(activityIds.map((activityId) => fetch(`${apiBase}/workspaces/${workspace.id}/activity/${activityId}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ read }) })));
      if (responses.some((response) => !response.ok)) throw new Error('Could not update this notification.');
      await reloadUpdates();
    } catch (reason) { setUpdatesError(reason instanceof Error ? reason.message : 'Could not update this notification.'); }
    finally { setUpdatesBusy(false); }
  }

  async function markAllUpdatesRead() {
    setUpdatesBusy(true); setUpdatesError('');
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/workspaces/${workspace.id}/activity/read-all`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Could not mark updates as read.');
      await reloadUpdates();
    } catch (reason) { setUpdatesError(reason instanceof Error ? reason.message : 'Could not mark updates as read.'); }
    finally { setUpdatesBusy(false); }
  }

  async function dismissUpdate(activityIds: string[]) {
    setUpdatesBusy(true); setUpdatesError('');
    try {
      const token = await getToken();
      const responses = await Promise.all(activityIds.map((activityId) => fetch(`${apiBase}/workspaces/${workspace.id}/activity/${activityId}/dismiss`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })));
      if (responses.some((response) => !response.ok)) throw new Error('Could not dismiss this notification.');
      await reloadUpdates();
    } catch (reason) { setUpdatesError(reason instanceof Error ? reason.message : 'Could not dismiss this notification.'); }
    finally { setUpdatesBusy(false); }
  }

  const unreadUpdates = updates.filter((entry) => !entry.isRead).length;
  const updateGroups = groupUpdates(updates);
  const updateLinks: Record<string, string> = { PROJECT: '/workspace/projects', TASK: '/workspace/tasks', TASK_COMMENT: '/workspace/tasks', TASK_CHECKLIST: '/workspace/tasks', MILESTONE: '/workspace/projects', DOCUMENT: '/workspace/documents', KNOWLEDGE: '/workspace/knowledge', FILE: '/workspace/files', CHANNEL: '/workspace/messages', WORKFLOW: '/workspace/automations', CALENDAR: '/workspace/calendar', WORKSPACE: '/workspace/settings' };

  const entityLabel = (type: string) => { const key = entityKey(type); return key ? t(key) : type.toLowerCase(); };
  const names = (actors: string[]) => actors.length === 2 ? t('actor.and', { a: actors[0], b: actors[1] }) : actors.length <= 1 ? actors[0] ?? '' : t(actors.length === 3 ? 'actor.othersOne' : 'actor.othersMany', { a: actors[0], b: actors[1], n: actors.length - 2 });

  function dueLabel(dueAt: string | null) {
    if (!dueAt) return t('due.none');
    const dateKey = dueAt.slice(0, 10);
    if (dateKey < todayKey) return t('due.overdue', { date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${dateKey}T12:00:00`)) });
    if (dateKey === todayKey) return t('due.today');
    return t('tasks.due', { date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${dateKey}T12:00:00`)) });
  }

  const entityIcons: Record<string, IconName> = { PROJECT: 'layers', MILESTONE: 'flag', TASK: 'tasks', TASK_COMMENT: 'chat', TASK_CHECKLIST: 'tasks', DOCUMENT: 'doc', KNOWLEDGE: 'doc', FILE: 'attach', CHANNEL: 'chat', WORKFLOW: 'bolt', CALENDAR: 'calendar', WORKSPACE: 'users' };
  const kindOf = (entry: Update): InboxTab => /mention/i.test(entry.message) ? 'MENTIONS' : /assign/i.test(entry.message) ? 'ASSIGNMENTS' : ['PROJECT', 'MILESTONE', 'TASK', 'TASK_COMMENT', 'TASK_CHECKLIST'].includes(entry.entityType) ? 'PROJECTS' : 'SYSTEM';
  const shownGroups = tab === 'ALL' ? updateGroups : updateGroups.filter((group) => group.items.some((item) => kindOf(item) === tab));
  const yesterdayKey = localDayKey(new Date(nowMs - 86_400_000));
  const dayGroups: { title: string; items: typeof shownGroups }[] = [];
  for (const group of shownGroups.slice(0, 12)) {
    const key = localDayKey(new Date(group.latest.createdAt));
    const title = key === todayKey ? t('inbox.dayToday') : key === yesterdayKey ? t('inbox.dayYesterday') : new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(group.latest.createdAt));
    const last = dayGroups[dayGroups.length - 1];
    if (last && last.title === title) last.items.push(group); else dayGroups.push({ title, items: [group] });
  }
  const queueSummary = filters.find((item) => item.key === filter)?.label;

  return (
    <div className="workspace-section-page inbox-page">
      <PageHeader eyebrow={t('inbox.eyebrow')} title={t('nav.inbox')} description={t('inbox.desc')} />
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <StatRow label={t('inbox.summaryAria')}>
        <StatCard icon="alert" value={loading ? '—' : attentionTasks.length} label={t('inbox.f.attention')} />
        <StatCard icon="calendar" value={loading ? '—' : overdueTasks.length} label={t('inbox.f.overdue')} tone="red" />
        <StatCard icon="flag" value={loading ? '—' : dueSoonTasks.length} label={t('inbox.f.dueSoon')} tone="violet" />
        <StatCard icon="layers" value={loading ? '—' : projects.filter((project) => project.status !== 'COMPLETED' && project.status !== 'ARCHIVED').length} label={t('inbox.activeProjects')} tone="blue" />
      </StatRow>
      <section className="inbox-notifications rd-panel" aria-labelledby="inbox-updates-title">
        <div className="rd-listbar">
          <PillTabs label={t('inbox.tabsAria')} value={tab} onChange={setTab} items={[{ key: 'ALL', label: t('inbox.tab.all') }, { key: 'MENTIONS', label: t('inbox.tab.mentions') }, { key: 'ASSIGNMENTS', label: t('inbox.tab.assignments') }, { key: 'PROJECTS', label: t('inbox.tab.projects') }, { key: 'SYSTEM', label: t('inbox.tab.system') }]} />
          <div className="rd-listbar__tools">
            <h2 id="inbox-updates-title" className="visually-hidden">{t('inbox.updates')}</h2>
            <span className="inbox-unread-count" aria-label={t('inbox.updates')}>{unreadUpdates}</span>
            <button type="button" className="rd-btn rd-btn--soft rd-btn--small" disabled={updatesBusy || unreadUpdates === 0} onClick={() => void markAllUpdatesRead()}><Icon name="checkCircle" size={17} />{t('inbox.markAll')}</button>
            <details className="rd-menu"><summary className="rd-iconbtn" aria-label={t('inbox.moreActions')}><Icon name="more" size={20} /></summary><div className="rd-menu__list"><Link href="/workspace/activity"><Icon name="arrow" size={16} />{t('inbox.seeAllActivity').replace(/\s*→$/, '')}</Link></div></details>
          </div>
        </div>
        {updatesError && <p className="productivity-error" role="alert">{updatesError}</p>}
        {updates.length === 0 ? <EmptyState art="envelope" compact title={t('inbox.noneInTab')} text={t('inbox.noUpdates')} /> : shownGroups.length === 0 ? <EmptyState art="envelope" compact title={t('inbox.noneInTab')} /> : <div className="rd-feed">{dayGroups.map((day) => <div key={day.title}><h3 className="rd-feed__day">{day.title}</h3>{day.items.map((group) => { const entry = group.latest; const ids = group.items.map((item) => item.id); return <article className={`rd-feedrow${group.unread ? ' is-unread' : ''}`} key={group.key}>
          <span className="rd-tile rd-tile--round" aria-hidden="true"><Icon name={entityIcons[entry.entityType] ?? 'sparkle'} size={22} />{group.unread > 0 && <i className="rd-tile__dot" />}</span>
          <div className="rd-feedrow__body"><p><strong>{group.items.length > 1 ? names(group.actors) : entry.actor.displayName}</strong> {entry.message}</p><small>{entityLabel(entry.entityType)}</small>
            {group.items.length > 1 && <details className="inbox-notifications__more"><summary>{t(group.items.length === 2 ? 'inbox.earlierOne' : 'inbox.earlierMany', { n: group.items.length - 1 })}</summary><ul>{group.items.slice(1).map((item) => <li key={item.id} className={item.isRead ? '' : 'is-unread'}><strong>{item.actor.displayName}</strong> {item.message}<small>{ago(item.createdAt)}</small></li>)}</ul></details>}</div>
          <time className="rd-feedrow__time" dateTime={entry.createdAt} title={new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))}>{ago(entry.createdAt)}</time>
          {group.unread > 0 ? <i className="rd-unread" aria-label={t('inbox.unread')} /> : <span className="rd-unread-slot" aria-hidden="true" />}
          <details className="rd-menu"><summary className="rd-iconbtn" aria-label={t('inbox.moreActions')}><Icon name="more" size={20} /></summary>
            <div className="rd-menu__list">
              <Link href={['TASK', 'TASK_COMMENT', 'TASK_CHECKLIST'].includes(entry.entityType) ? `/workspace/tasks/${entry.entityId}` : updateLinks[entry.entityType] ?? '/workspace/activity'} aria-label={t('inbox.openRelated', { type: entityLabel(entry.entityType) })}><Icon name="arrow" size={16} />{t('inbox.open')}</Link>
              <button type="button" disabled={updatesBusy} onClick={() => void updateReadState(group.unread ? group.items.filter((item) => !item.isRead).map((item) => item.id) : ids, group.unread === 0 ? false : true)}><Icon name="checkCircle" size={16} />{group.unread ? (group.items.length > 1 ? t('inbox.readAll') : t('inbox.read')) : t('inbox.unread')}</button>
              <button type="button" className="is-danger" disabled={updatesBusy} onClick={() => void dismissUpdate(ids)}><Icon name="close" size={16} />{group.items.length > 1 ? t('inbox.dismissAll') : t('inbox.dismiss')}</button>
            </div></details>
        </article>; })}</div>)}</div>}
        {shownGroups.length > 12 && <Link className="inbox-updates-more" href="/workspace/activity">{t('inbox.seeAllActivity')}</Link>}
      </section>
      <Panel eyebrow={t('inbox.queue')} title={queueSummary} id="inbox-queue" className="inbox-panel" actions={<Link className="rd-btn rd-btn--soft rd-btn--small" href="/workspace/projects">{t('inbox.manage')} <span aria-hidden="true">→</span></Link>}>
        <div className="rd-filterbar"><PillTabs size="small" label={t('inbox.filterAria')} value={filter} onChange={setFilter} items={filters.map((item) => ({ key: item.key, label: item.label, count: item.count }))} /><TaskLabelFilter labels={allLabels} value={labelFilter} onChange={setLabelFilter} /></div>
        {loading ? <p className="productivity-message">{t('inbox.loading')}</p> : visibleFilteredTasks.length === 0 ? <EmptyState art="check" compact title={filter === 'ATTENTION' ? t('inbox.caughtUp') : t('inbox.emptyQueue')} text={filter === 'ATTENTION' ? t('inbox.caughtUpHint') : t('inbox.emptyQueueHint')}><Link className="rd-btn rd-btn--soft" href="/workspace/projects">{t('tasks.openProjects')} <span aria-hidden="true">→</span></Link></EmptyState> : (
          <div className="rd-groups">{visibleFilteredTasks.map((task) => <article className={`rd-taskrow inbox-task${task.dueAt && task.dueAt.slice(0, 10) < todayKey ? ' is-overdue' : ''}`} key={task.id}>
            <span className="rd-tile rd-tile--round rd-tile--small" aria-hidden="true"><Icon name="tasks" size={18} /></span>
            <div className="rd-taskrow__main"><h4><Link href={`/workspace/tasks/${task.id}`}>{task.title}</Link><TaskBadges task={task} /></h4><TaskLabels labels={task.labels} compact /></div>
            {task.project ? <Link className="rd-projectpill" href="/workspace/projects"><Icon name="layers" size={15} />{task.project.name}</Link> : <span />}
            <Pill tone={priorityTone(task.priority)}><i className="rd-dot" />{t(`prio.${task.priority.toLowerCase()}` as Key).replace(/^./, (c) => c.toLocaleUpperCase())}</Pill>
            <span className={`rd-due${task.dueAt && task.dueAt.slice(0, 10) < todayKey ? ' rd-due--late' : ''}`}><time><Icon name="calendar" size={16} />{dueLabel(task.dueAt)}</time></span>
            <label className="rd-statuspick"><span className="visually-hidden">{t('tasks.statusFor', { title: task.title })}</span><select className="rd-select" value={task.status} disabled={savingId === task.id} onChange={(event) => void updateStatus(task.id, event.target.value)}>{taskStatuses.slice(0, 4).map((status) => <option key={status.value} value={status.value}>{t(status.label)}</option>)}</select></label>
          </article>)}</div>
        )}
      </Panel>
    </div>
  );
}
