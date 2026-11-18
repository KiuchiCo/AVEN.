'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useWorkspaceSession } from './workspace-shell';
import { TaskLabelFilter, TaskLabels } from './task-labels';

type TaskRecord = {
  id: string;
  title: string;
  status: string;
  priority: string;
  labels: string[];
  dueAt: string | null;
  project: { id: string; name: string } | null;
  events: { id: string; title: string; startsAt: string }[];
};
type ProjectRecord = { id: string; name: string; status: string };

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const taskStatuses = [
  { value: 'TODO', label: 'To do' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

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
  const { tasks, projects, loading, savingId, error, updateStatus } = useWorkspaceProductivity();
  const [filter, setFilter] = useState('OPEN');
  const [labelFilter, setLabelFilter] = useState('');
  const allLabels = useMemo(() => [...new Set(tasks.flatMap((task) => task.labels))].sort(), [tasks]);
  useEffect(() => {
    const initialLabel = new URLSearchParams(window.location.search).get('label')?.trim().toLocaleLowerCase();
    if (initialLabel) setLabelFilter(initialLabel);
  }, []);
  const visibleTasks = useMemo(() => {
    const matching = labelFilter ? tasks.filter((task) => task.labels.includes(labelFilter)) : tasks;
    if (filter === 'ALL') return matching;
    if (filter === 'COMPLETED') return matching.filter((task) => task.status === 'COMPLETED');
    return matching.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED');
  }, [filter, labelFilter, tasks]);

  return (
    <div className="workspace-section-page task-list-page">
      <p className="workspace-eyebrow">YOUR WORKSPACE</p>
      <h1>My Tasks</h1>
      <p className="workspace-section-page__description">Your tasks across projects, saved in this workspace.</p>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <section className="task-list-panel" aria-labelledby="my-tasks-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">{projects.length} PROJECTS · {tasks.length} TASKS</p><h2 id="my-tasks-title">All workspace tasks</h2></div>
          <div className="task-filter-group"><label className="task-filter">Show<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="OPEN">Open</option><option value="ALL">All</option><option value="COMPLETED">Completed</option></select></label><TaskLabelFilter labels={allLabels} value={labelFilter} onChange={setLabelFilter} /></div>
        </div>
        {loading ? <p className="productivity-message">Loading your tasks…</p> : visibleTasks.length === 0 ? (
          <div className="task-list-empty"><span aria-hidden="true">☑</span><h3>{filter === 'COMPLETED' ? 'No completed tasks yet.' : 'A clear slate.'}</h3><p>{filter === 'COMPLETED' ? 'Completed tasks will be collected here.' : 'Create a task from your projects board and it will appear here.'}</p><Link href="/workspace/projects">Open projects <span aria-hidden="true">→</span></Link></div>
        ) : (
          <div className="task-list-records">{visibleTasks.map((task) => <article className="task-list-record" key={task.id}>
            <div className="task-list-record__main"><span className={`productivity-priority productivity-priority--${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span><h3>{task.title}</h3><div className="task-list-record__meta">{task.project && <Link href="/workspace/projects">{task.project.name}</Link>}{task.dueAt && <time dateTime={task.dueAt}>Due {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(task.dueAt))}</time>}{task.events.length > 0 && <span>{task.events.length === 1 ? 'Scheduled' : `${task.events.length} calendar events`}</span>}</div><TaskLabels labels={task.labels} compact /></div>
            <label><span className="visually-hidden">Status for {task.title}</span><select value={task.status} disabled={savingId === task.id} onChange={(event) => void updateStatus(task.id, event.target.value)}>{taskStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
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
  const { tasks, projects, loading, savingId, error, updateStatus } = useWorkspaceProductivity();
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [updates, setUpdates] = useState<{ id: string; entityType: string; entityId: string; message: string; createdAt: string; isRead: boolean; actor: { displayName: string } }[]>([]);
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
    { key: 'ATTENTION', label: 'Needs attention', count: attentionTasks.length },
    { key: 'OVERDUE', label: 'Overdue', count: overdueTasks.length },
    { key: 'DUE_SOON', label: 'Due this week', count: dueSoonTasks.length },
    { key: 'HIGH_PRIORITY', label: 'High priority', count: highPriorityTasks.length },
    { key: 'ALL_OPEN', label: 'All open', count: openTasks.length },
  ];

  const reloadUpdates = useCallback(async () => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API.');
    const response = await fetch(`${apiBase}/workspaces/${workspace.id}/activity/inbox`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load workspace updates.');
    setUpdates(await response.json());
  }, [getToken, workspace.id]);

  useEffect(() => {
    let cancelled = false;
    void reloadUpdates().catch((reason) => { if (!cancelled) setUpdatesError(reason instanceof Error ? reason.message : 'Could not load workspace updates.'); });
    return () => { cancelled = true; };
  }, [reloadUpdates]);

  async function updateReadState(activityId: string, read: boolean) {
    setUpdatesBusy(true); setUpdatesError('');
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/workspaces/${workspace.id}/activity/${activityId}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ read }) });
      if (!response.ok) throw new Error('Could not update this notification.');
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

  async function dismissUpdate(activityId: string) {
    setUpdatesBusy(true); setUpdatesError('');
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/workspaces/${workspace.id}/activity/${activityId}/dismiss`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Could not dismiss this notification.');
      await reloadUpdates();
    } catch (reason) { setUpdatesError(reason instanceof Error ? reason.message : 'Could not dismiss this notification.'); }
    finally { setUpdatesBusy(false); }
  }

  const unreadUpdates = updates.filter((entry) => !entry.isRead).length;
  const updateLinks: Record<string, string> = { PROJECT: '/workspace/projects', TASK: '/workspace/tasks', MILESTONE: '/workspace/projects', DOCUMENT: '/workspace/documents', KNOWLEDGE: '/workspace/knowledge', CALENDAR: '/workspace/calendar', WORKSPACE: '/workspace/settings' };

  function dueLabel(dueAt: string | null) {
    if (!dueAt) return 'No due date';
    const dateKey = dueAt.slice(0, 10);
    if (dateKey < todayKey) return `Overdue · ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${dateKey}T12:00:00`))}`;
    if (dateKey === todayKey) return 'Due today';
    return `Due ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${dateKey}T12:00:00`))}`;
  }

  return (
    <div className="workspace-section-page inbox-page">
      <p className="workspace-eyebrow">YOUR WORKSPACE · ACTION CENTER</p>
      <h1>Inbox</h1>
      <p className="workspace-section-page__description">A focused place for teammate updates, overdue work, upcoming deadlines, and high-priority tasks.</p>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <section className="inbox-notifications" aria-labelledby="inbox-updates-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">FROM YOUR TEAM</p><h2 id="inbox-updates-title">Workspace updates <span className="inbox-unread-count">{unreadUpdates}</span></h2></div><button type="button" disabled={updatesBusy || unreadUpdates === 0} onClick={() => void markAllUpdatesRead()}>Mark all read</button></div>
        {updatesError && <p className="productivity-error" role="alert">{updatesError}</p>}
        {updates.length === 0 ? <p className="productivity-message">Teammate activity will show up here when someone else updates this workspace.</p> : <div className="inbox-notifications__list">{updates.slice(0, 8).map((entry) => <article className={!entry.isRead ? 'is-unread' : ''} key={entry.id}>
          <span className="inbox-notifications__dot" aria-hidden="true" />
          <div><p><strong>{entry.actor.displayName}</strong> {entry.message}</p><small>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))} · {entry.entityType.toLowerCase()}</small></div>
          <Link href={updateLinks[entry.entityType] ?? '/workspace/activity'} aria-label={`Open related ${entry.entityType.toLowerCase()} update`}>→</Link>
          <button type="button" disabled={updatesBusy} onClick={() => void updateReadState(entry.id, !entry.isRead)}>{entry.isRead ? 'Unread' : 'Read'}</button>
          <button type="button" disabled={updatesBusy} onClick={() => void dismissUpdate(entry.id)}>Dismiss</button>
        </article>)}</div>}
        {updates.length > 8 && <Link className="inbox-updates-more" href="/workspace/activity">See all workspace activity →</Link>}
      </section>
      <div className="inbox-summary" aria-label="Work needing attention">
        <div><span>Needs attention</span><strong>{loading ? '—' : attentionTasks.length}</strong></div>
        <div><span>Overdue</span><strong>{loading ? '—' : overdueTasks.length}</strong></div>
        <div><span>Due this week</span><strong>{loading ? '—' : dueSoonTasks.length}</strong></div>
        <div><span>Active projects</span><strong>{loading ? '—' : projects.filter((project) => project.status !== 'COMPLETED' && project.status !== 'ARCHIVED').length}</strong></div>
      </div>
      <section className="inbox-panel" aria-labelledby="inbox-queue-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">WORK QUEUE</p><h2 id="inbox-queue-title">{filters.find((item) => item.key === filter)?.label}</h2></div><Link href="/workspace/projects">Manage projects <span aria-hidden="true">→</span></Link></div>
        <div className="inbox-filters" role="group" aria-label="Filter inbox tasks">{filters.map((item) => <button type="button" key={item.key} aria-pressed={filter === item.key} className={filter === item.key ? 'is-active' : ''} onClick={() => setFilter(item.key)}>{item.label}<span>{item.count}</span></button>)}</div><TaskLabelFilter labels={allLabels} value={labelFilter} onChange={setLabelFilter} />
        {loading ? <p className="productivity-message">Loading your inbox…</p> : visibleFilteredTasks.length === 0 ? <div className="task-list-empty"><span aria-hidden="true">✓</span><h3>{filter === 'ATTENTION' ? 'You’re all caught up.' : 'Nothing in this queue.'}</h3><p>{filter === 'ATTENTION' ? 'No overdue, near-term, or high-priority work needs your attention.' : 'Tasks will appear here when they match this filter.'}</p><Link href="/workspace/projects">Open projects <span aria-hidden="true">→</span></Link></div> : (
          <div className="task-list-records">{visibleFilteredTasks.map((task) => <article className="task-list-record inbox-task" key={task.id}>
            <div className="task-list-record__main"><span className={`productivity-priority productivity-priority--${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span><h3>{task.title}</h3><div className="task-list-record__meta">{task.project && <Link href="/workspace/projects">{task.project.name}</Link>}<time className={task.dueAt && task.dueAt.slice(0, 10) < todayKey ? 'inbox-task__overdue' : ''}>{dueLabel(task.dueAt)}</time>{task.events.length > 0 && <span>{task.events.length === 1 ? 'Scheduled' : `${task.events.length} calendar events`}</span>}</div><TaskLabels labels={task.labels} compact /></div>
            <label><span className="visually-hidden">Status for {task.title}</span><select value={task.status} disabled={savingId === task.id} onChange={(event) => void updateStatus(task.id, event.target.value)}>{taskStatuses.slice(0, 4).map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          </article>)}</div>
        )}
      </section>
    </div>
  );
}

export function WorkspaceHighlights() {
  const { tasks, projects, loading, error } = useWorkspaceProductivity();
  const openTasks = tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED');
  const activeProjects = projects.filter((project) => project.status !== 'COMPLETED' && project.status !== 'ARCHIVED');
  const scheduledTasks = tasks.filter((task) => task.events.length > 0);
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const dueSoon = openTasks.filter((task) => task.dueAt && new Date(task.dueAt) >= now && new Date(task.dueAt) <= weekEnd);

  return (
    <section className="workspace-live-overview" aria-labelledby="live-overview-title">
      <div className="workspace-section-heading"><div><p className="workspace-eyebrow">FROM YOUR WORKSPACE</p><h2 id="live-overview-title">Your work at a glance</h2></div><Link href="/workspace/tasks">All tasks <span aria-hidden="true">→</span></Link></div>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <div className="workspace-live-stats">
        <div><span>Active projects</span><strong>{loading ? '—' : activeProjects.length}</strong></div>
        <div><span>Open tasks</span><strong>{loading ? '—' : openTasks.length}</strong></div>
        <div><span>Due this week</span><strong>{loading ? '—' : dueSoon.length}</strong></div>
        <div><span>Tasks scheduled</span><strong>{loading ? '—' : scheduledTasks.length}</strong></div>
      </div>
      {!loading && openTasks.length === 0 && <p className="workspace-live-empty">Your open tasks will appear here after you add them to a project.</p>}
      {!loading && openTasks.length > 0 && <div className="workspace-live-priorities"><h3>Next up</h3>{openTasks.slice().sort((a, b) => {
        const rank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return (rank[a.priority] ?? 4) - (rank[b.priority] ?? 4);
      }).slice(0, 3).map((task) => <div className="workspace-live-task" key={task.id}><span className={`productivity-priority productivity-priority--${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span><strong>{task.title}</strong>{task.project && <small>{task.project.name}</small>}</div>)}</div>}
    </section>
  );
}
