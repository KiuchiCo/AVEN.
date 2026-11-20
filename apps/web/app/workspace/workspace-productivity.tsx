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

export function MyTasksWorkspace() {
  const t = useT();
  const { tasks, projects, loading, savingId, error, updateStatus } = useWorkspaceProductivity();
  const [filter, setFilter] = useState('OPEN');
  const urlLabel = useSyncExternalStore(
    (notify) => { window.addEventListener('popstate', notify); return () => window.removeEventListener('popstate', notify); },
    () => new URLSearchParams(window.location.search).get('label')?.trim().toLocaleLowerCase() ?? '',
    () => '',
  );
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const labelFilter = selectedLabel ?? urlLabel;
  const allLabels = useMemo(() => [...new Set(tasks.flatMap((task) => task.labels))].sort(), [tasks]);
  const visibleTasks = useMemo(() => {
    const matching = labelFilter ? tasks.filter((task) => task.labels.includes(labelFilter)) : tasks;
    if (filter === 'ALL') return matching;
    if (filter === 'COMPLETED') return matching.filter((task) => task.status === 'COMPLETED');
    return matching.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED');
  }, [filter, labelFilter, tasks]);

  return (
    <div className="workspace-section-page task-list-page">
      <p className="workspace-eyebrow">{t('tasks.eyebrow')}</p>
      <h1>{t('nav.tasks')}</h1>
      <p className="workspace-section-page__description">{t('tasks.desc')}</p>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <section className="task-list-panel" aria-labelledby="my-tasks-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">{t('tasks.count', { p: projects.length, n: tasks.length })}</p><h2 id="my-tasks-title">{t('tasks.all')}</h2></div>
          <div className="task-filter-group"><label className="task-filter">{t('tasks.show')}<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="OPEN">{t('tasks.f.open')}</option><option value="ALL">{t('tasks.f.all')}</option><option value="COMPLETED">{t('tasks.f.completed')}</option></select></label><TaskLabelFilter labels={allLabels} value={labelFilter} onChange={setSelectedLabel} /></div>
        </div>
        {loading ? <p className="productivity-message">{t('tasks.loading')}</p> : visibleTasks.length === 0 ? (
          <div className="task-list-empty"><span aria-hidden="true">☑</span><h3>{filter === 'COMPLETED' ? t('tasks.emptyDone') : t('tasks.emptyClear')}</h3><p>{filter === 'COMPLETED' ? t('tasks.emptyDoneHint') : t('tasks.emptyClearHint')}</p><Link href="/workspace/projects">{t('tasks.openProjects')} <span aria-hidden="true">→</span></Link></div>
        ) : (
          <div className="task-list-records">{visibleTasks.map((task) => <article className="task-list-record" key={task.id}>
            <div className="task-list-record__main"><span className={`productivity-priority productivity-priority--${task.priority.toLowerCase()}`}>{t(`prio.${task.priority.toLowerCase()}` as Key)}</span><h3><Link href={`/workspace/tasks/${task.id}`}>{task.title}</Link><TaskBadges task={task} /></h3><div className="task-list-record__meta">{task.project && <Link href="/workspace/projects">{task.project.name}</Link>}{task.dueAt && <time dateTime={task.dueAt}>{t('tasks.due', { date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(task.dueAt)) })}</time>}{task.events.length > 0 && <span>{task.events.length === 1 ? t('tasks.scheduled') : t('tasks.events', { n: task.events.length })}</span>}</div><TaskLabels labels={task.labels} compact /></div>
            <label><span className="visually-hidden">{t('tasks.statusFor', { title: task.title })}</span><select value={task.status} disabled={savingId === task.id} onChange={(event) => void updateStatus(task.id, event.target.value)}>{taskStatuses.map((status) => <option key={status.value} value={status.value}>{t(status.label)}</option>)}</select></label>
          </article>)}</div>
        )}
      </section>
    </div>
  );
}

type InboxFilter = 'ATTENTION' | 'OVERDUE' | 'DUE_SOON' | 'HIGH_PRIORITY' | 'ALL_OPEN';

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function InboxWorkspace() {
  const t = useT();
  const { tasks, projects, loading, savingId, error, updateStatus } = useWorkspaceProductivity();
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [updates, setUpdates] = useState<Update[]>([]);
  const [updatesError, setUpdatesError] = useState('');
  const [updatesBusy, setUpdatesBusy] = useState(false);
  const [filter, setFilter] = useState<InboxFilter>('ATTENTION');
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

  return (
    <div className="workspace-section-page inbox-page">
      <p className="workspace-eyebrow">{t('inbox.eyebrow')}</p>
      <h1>{t('nav.inbox')}</h1>
      <p className="workspace-section-page__description">{t('inbox.desc')}</p>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <section className="inbox-notifications" aria-labelledby="inbox-updates-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">{t('inbox.fromTeam')}</p><h2 id="inbox-updates-title">{t('inbox.updates')} <span className="inbox-unread-count">{unreadUpdates}</span></h2></div><button type="button" disabled={updatesBusy || unreadUpdates === 0} onClick={() => void markAllUpdatesRead()}>{t('inbox.markAll')}</button></div>
        {updatesError && <p className="productivity-error" role="alert">{updatesError}</p>}
        {updates.length === 0 ? <p className="productivity-message">{t('inbox.noUpdates')}</p> : <div className="inbox-notifications__list">{updateGroups.slice(0, 8).map((group) => { const entry = group.latest; const ids = group.items.map((item) => item.id); return <article className={group.unread ? 'is-unread' : ''} key={group.key}>
          <span className="inbox-notifications__dot" aria-hidden="true" />
          <div><p><strong>{group.items.length > 1 ? names(group.actors) : entry.actor.displayName}</strong> {entry.message}</p><small>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))} · {entityLabel(entry.entityType)}</small>
            {group.items.length > 1 && <details className="inbox-notifications__more"><summary>{t(group.items.length === 2 ? 'inbox.earlierOne' : 'inbox.earlierMany', { n: group.items.length - 1 })}</summary><ul>{group.items.slice(1).map((item) => <li key={item.id} className={item.isRead ? '' : 'is-unread'}><strong>{item.actor.displayName}</strong> {item.message}<small>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</small></li>)}</ul></details>}</div>
          <Link href={['TASK', 'TASK_COMMENT', 'TASK_CHECKLIST'].includes(entry.entityType) ? `/workspace/tasks/${entry.entityId}` : updateLinks[entry.entityType] ?? '/workspace/activity'} aria-label={t('inbox.openRelated', { type: entityLabel(entry.entityType) })}>→</Link>
          <button type="button" disabled={updatesBusy} onClick={() => void updateReadState(group.unread ? group.items.filter((item) => !item.isRead).map((item) => item.id) : ids, group.unread === 0 ? false : true)}>{group.unread ? (group.items.length > 1 ? t('inbox.readAll') : t('inbox.read')) : t('inbox.unread')}</button>
          <button type="button" disabled={updatesBusy} onClick={() => void dismissUpdate(ids)}>{group.items.length > 1 ? t('inbox.dismissAll') : t('inbox.dismiss')}</button>
        </article>; })}</div>}
        {updateGroups.length > 8 && <Link className="inbox-updates-more" href="/workspace/activity">{t('inbox.seeAllActivity')}</Link>}
      </section>
      <div className="inbox-summary" aria-label={t('inbox.summaryAria')}>
        <div><span>{t('inbox.f.attention')}</span><strong>{loading ? '—' : attentionTasks.length}</strong></div>
        <div><span>{t('inbox.f.overdue')}</span><strong>{loading ? '—' : overdueTasks.length}</strong></div>
        <div><span>{t('inbox.f.dueSoon')}</span><strong>{loading ? '—' : dueSoonTasks.length}</strong></div>
        <div><span>{t('inbox.activeProjects')}</span><strong>{loading ? '—' : projects.filter((project) => project.status !== 'COMPLETED' && project.status !== 'ARCHIVED').length}</strong></div>
      </div>
      <section className="inbox-panel" aria-labelledby="inbox-queue-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">{t('inbox.queue')}</p><h2 id="inbox-queue-title">{filters.find((item) => item.key === filter)?.label}</h2></div><Link href="/workspace/projects">{t('inbox.manage')} <span aria-hidden="true">→</span></Link></div>
        <div className="inbox-filters" role="group" aria-label={t('inbox.filterAria')}>{filters.map((item) => <button type="button" key={item.key} aria-pressed={filter === item.key} className={filter === item.key ? 'is-active' : ''} onClick={() => setFilter(item.key)}>{item.label}<span>{item.count}</span></button>)}</div><TaskLabelFilter labels={allLabels} value={labelFilter} onChange={setLabelFilter} />
        {loading ? <p className="productivity-message">{t('inbox.loading')}</p> : visibleFilteredTasks.length === 0 ? <div className="task-list-empty"><span aria-hidden="true">✓</span><h3>{filter === 'ATTENTION' ? t('inbox.caughtUp') : t('inbox.emptyQueue')}</h3><p>{filter === 'ATTENTION' ? t('inbox.caughtUpHint') : t('inbox.emptyQueueHint')}</p><Link href="/workspace/projects">{t('tasks.openProjects')} <span aria-hidden="true">→</span></Link></div> : (
          <div className="task-list-records">{visibleFilteredTasks.map((task) => <article className="task-list-record inbox-task" key={task.id}>
            <div className="task-list-record__main"><span className={`productivity-priority productivity-priority--${task.priority.toLowerCase()}`}>{t(`prio.${task.priority.toLowerCase()}` as Key)}</span><h3><Link href={`/workspace/tasks/${task.id}`}>{task.title}</Link><TaskBadges task={task} /></h3><div className="task-list-record__meta">{task.project && <Link href="/workspace/projects">{task.project.name}</Link>}<time className={task.dueAt && task.dueAt.slice(0, 10) < todayKey ? 'inbox-task__overdue' : ''}>{dueLabel(task.dueAt)}</time>{task.events.length > 0 && <span>{task.events.length === 1 ? t('tasks.scheduled') : t('tasks.events', { n: task.events.length })}</span>}</div><TaskLabels labels={task.labels} compact /></div>
            <label><span className="visually-hidden">{t('tasks.statusFor', { title: task.title })}</span><select value={task.status} disabled={savingId === task.id} onChange={(event) => void updateStatus(task.id, event.target.value)}>{taskStatuses.slice(0, 4).map((status) => <option key={status.value} value={status.value}>{t(status.label)}</option>)}</select></label>
          </article>)}</div>
        )}
      </section>
    </div>
  );
}
