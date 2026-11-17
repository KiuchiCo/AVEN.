'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useWorkspaceSession } from './workspace-shell';

type TaskRecord = {
  id: string;
  title: string;
  status: string;
  priority: string;
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
  const visibleTasks = useMemo(() => {
    if (filter === 'ALL') return tasks;
    if (filter === 'COMPLETED') return tasks.filter((task) => task.status === 'COMPLETED');
    return tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED');
  }, [filter, tasks]);

  return (
    <div className="workspace-section-page task-list-page">
      <p className="workspace-eyebrow">YOUR WORKSPACE</p>
      <h1>My Tasks</h1>
      <p className="workspace-section-page__description">Your tasks across projects, saved in this workspace.</p>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <section className="task-list-panel" aria-labelledby="my-tasks-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">{projects.length} PROJECTS · {tasks.length} TASKS</p><h2 id="my-tasks-title">All workspace tasks</h2></div>
          <label className="task-filter">Show<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="OPEN">Open</option><option value="ALL">All</option><option value="COMPLETED">Completed</option></select></label>
        </div>
        {loading ? <p className="productivity-message">Loading your tasks…</p> : visibleTasks.length === 0 ? (
          <div className="task-list-empty"><span aria-hidden="true">☑</span><h3>{filter === 'COMPLETED' ? 'No completed tasks yet.' : 'A clear slate.'}</h3><p>{filter === 'COMPLETED' ? 'Completed tasks will be collected here.' : 'Create a task from your projects board and it will appear here.'}</p><Link href="/workspace/projects">Open projects <span aria-hidden="true">→</span></Link></div>
        ) : (
          <div className="task-list-records">{visibleTasks.map((task) => <article className="task-list-record" key={task.id}>
            <div className="task-list-record__main"><span className={`productivity-priority productivity-priority--${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span><h3>{task.title}</h3><div className="task-list-record__meta">{task.project && <Link href="/workspace/projects">{task.project.name}</Link>}{task.dueAt && <time dateTime={task.dueAt}>Due {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(task.dueAt))}</time>}{task.events.length > 0 && <span>{task.events.length === 1 ? 'Scheduled' : `${task.events.length} calendar events`}</span>}</div></div>
            <label><span className="visually-hidden">Status for {task.title}</span><select value={task.status} disabled={savingId === task.id} onChange={(event) => void updateStatus(task.id, event.target.value)}>{taskStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
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
