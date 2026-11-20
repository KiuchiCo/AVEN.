'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useWorkspaceSession } from '../../workspace-shell';
import { TaskLabels } from '../../task-labels';
import { GanttChart } from './gantt-chart';
import { FavouriteStar } from '../../favourites';
import { AttachmentsPanel } from '../../files/attachments-panel';
import { parseTaskCsv, type TaskImportRow } from '../task-csv';

type Project = { id: string; name: string; description: string | null; status: string; dueAt: string | null; budgetTotalCents: number | null; budgetSpentCents: number };
type ProjectTask = { id: string; title: string; description: string | null; status: string; priority: string; labels: string[]; startAt: string | null; dueAt: string | null; project: { id: string; name: string } | null; assignee: { id: string; displayName: string } | null; events: { id: string }[]; dependsOn: { id: string; title: string; status: string }[]; blocks: { id: string; title: string; status: string }[] };
type ProjectDocument = { id: string; title: string; updatedAt: string; project: { id: string; name: string } | null };
type Milestone = { id: string; title: string; dueAt: string | null; completedAt: string | null };
type ActivityEntry = { id: string; entityType: string; entityId: string; message: string; createdAt: string; actor: { displayName: string } };
type WorkspaceMember = { userId: string; displayName: string };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const taskStatuses = [
  { value: 'TODO', label: 'To do' }, { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'IN_REVIEW', label: 'In review' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' },
];
const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 });

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : 'No date set';
}

export default function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [taskFilter, setTaskFilter] = useState<'ALL' | 'OPEN' | 'BLOCKED' | 'OVERDUE' | 'COMPLETED'>('ALL');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('ALL');
  const [taskSearch, setTaskSearch] = useState('');
  const [importRows, setImportRows] = useState<TaskImportRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importMode, setImportMode] = useState<'CREATE' | 'UPSERT'>('CREATE');
  const [showProjectEditor, setShowProjectEditor] = useState(false);
  const [tab, setTab] = useState<'OVERVIEW' | 'TIMELINE' | 'DOCUMENTS' | 'FILES' | 'ACTIVITY' | 'BUDGET'>('OVERVIEW');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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

  const loadProjectData = useCallback(async () => {
    const [projectRows, taskRows, documentRows, activityRows, milestoneRows, memberRows] = await Promise.all([
      request(`/workspaces/${workspace.id}/projects`) as Promise<Project[]>,
      request(`/workspaces/${workspace.id}/tasks`) as Promise<ProjectTask[]>,
      request(`/workspaces/${workspace.id}/documents`) as Promise<ProjectDocument[]>,
      request(`/workspaces/${workspace.id}/activity`) as Promise<ActivityEntry[]>,
      request(`/workspaces/${workspace.id}/projects/${projectId}/milestones`) as Promise<Milestone[]>,
      request(`/workspaces/${workspace.id}/members`) as Promise<WorkspaceMember[]>,
    ]);
    const selected = projectRows.find((item) => item.id === projectId);
    if (!selected) throw new Error('This project could not be found in the current workspace.');
    const projectTasks = taskRows.filter((item) => item.project?.id === projectId);
    const projectDocuments = documentRows.filter((item) => item.project?.id === projectId);
    const relatedIds = new Set([selected.id, ...projectTasks.map((item) => item.id), ...projectTasks.flatMap((item) => item.events.map((event) => event.id)), ...projectDocuments.map((item) => item.id), ...milestoneRows.map((item) => item.id)]);
    return { project: selected, tasks: projectTasks, documents: projectDocuments, milestones: milestoneRows, members: memberRows, activity: activityRows.filter((item) => relatedIds.has(item.entityId)) };
  }, [projectId, request, workspace.id]);

  const applyProjectData = useCallback((data: Awaited<ReturnType<typeof loadProjectData>>) => {
    setProject(data.project); setTasks(data.tasks); setDocuments(data.documents); setMilestones(data.milestones); setMembers(data.members); setActivity(data.activity);
  }, []);

  const reload = useCallback(async () => applyProjectData(await loadProjectData()), [applyProjectData, loadProjectData]);

  useEffect(() => {
    let cancelled = false;
    void loadProjectData().then((data) => { if (!cancelled) applyProjectData(data); }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load project workspace.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applyProjectData, loadProjectData]);

  const completedCount = tasks.filter((task) => task.status === 'COMPLETED').length;
  const plannedTaskCount = tasks.filter((task) => task.status !== 'CANCELLED').length;
  const openTasks = tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED');
  const blockedTasks = openTasks.filter((task) => task.dependsOn.some((item) => item.status !== 'COMPLETED'));
  const readyTasks = openTasks.filter((task) => !task.dependsOn.some((item) => item.status !== 'COMPLETED'))
    .sort((a, b) => {
      const priorityRank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return priorityRank[a.priority] - priorityRank[b.priority] || (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.title.localeCompare(b.title);
    });
  const progress = plannedTaskCount ? Math.round((completedCount / plannedTaskCount) * 100) : 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const overdueTasks = openTasks.filter((task) => task.dueAt && task.dueAt.slice(0, 10) < todayKey).sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndKey = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`;
  const dueSoonTasks = openTasks.filter((task) => task.dueAt && task.dueAt.slice(0, 10) >= todayKey && task.dueAt.slice(0, 10) <= weekEndKey).sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
  const overdueMilestones = milestones.filter((milestone) => !milestone.completedAt && milestone.dueAt && milestone.dueAt.slice(0, 10) < todayKey);
  const upcomingMilestones = milestones.filter((milestone) => !milestone.completedAt && milestone.dueAt && milestone.dueAt.slice(0, 10) >= todayKey).sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
  const visibleProjectTasks = tasks.filter((task) => {
    const matchesStatus = taskFilter === 'ALL'
      || (taskFilter === 'OPEN' && task.status !== 'COMPLETED' && task.status !== 'CANCELLED')
      || (taskFilter === 'BLOCKED' && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && task.dependsOn.some((dependency) => dependency.status !== 'COMPLETED'))
      || (taskFilter === 'OVERDUE' && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && Boolean(task.dueAt && task.dueAt.slice(0, 10) < todayKey))
      || (taskFilter === 'COMPLETED' && task.status === 'COMPLETED');
    const matchesPriority = taskPriorityFilter === 'ALL' || task.priority === taskPriorityFilter;
    const query = taskSearch.trim().toLocaleLowerCase();
    const matchesSearch = !query || [task.title, ...task.labels, task.assignee?.displayName ?? ''].some((value) => value.toLocaleLowerCase().includes(query));
    return matchesStatus && matchesPriority && matchesSearch;
  }).sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
  const timelineItems = useMemo(() => [
    ...tasks.filter((task) => task.dueAt).map((task) => ({ id: task.id, title: task.title, date: task.dueAt as string, type: 'Task', state: task.status })),
    ...milestones.filter((milestone) => milestone.dueAt).map((milestone) => ({ id: milestone.id, title: milestone.title, date: milestone.dueAt as string, type: 'Milestone', state: milestone.completedAt ? 'COMPLETED' : 'UPCOMING' })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [milestones, tasks]);

  async function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!project) return;
    const form = new FormData(event.currentTarget);
    setSaving(true); setError(''); setNotice('');
    try {
      await request(`/workspaces/${workspace.id}/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ budgetTotal: form.get('budgetTotal') || null, budgetSpent: form.get('budgetSpent') }) });
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the project budget.'); }
    finally { setSaving(false); }
  }

  async function saveProjectDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!project) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ name: form.get('name'), description: form.get('description') || null, status: form.get('status'), dueAt: form.get('dueAt') || null }) });
      setShowProjectEditor(false);
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update project details.'); }
    finally { setSaving(false); }
  }

  async function updateTaskStatus(taskId: string, status: string) {
    setSaving(true); setError('');
    try { await request(`/workspaces/${workspace.id}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this task.'); }
    finally { setSaving(false); }
  }

  function exportProjectTasks() {
    if (!project || tasks.length === 0) return;
    const headers = ['id', 'title', 'description', 'status', 'priority', 'startAt', 'dueAt', 'projectId', 'assigneeId', 'labels'];
    const rows = tasks.map((task) => [task.id, task.title, task.description ?? '', task.status, task.priority, task.startAt ?? '', task.dueAt ?? '', project.id, task.assignee?.id ?? '', task.labels.join(';')]);
    const csvCell = (value: string) => {
      const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.name.replace(/[^a-z0-9-_]+/gi, '-').toLocaleLowerCase() || 'aven-project'}-tasks.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function readProjectTaskCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setError('');
    try {
      if (file.size > 1_000_000) throw new Error('CSV files must be smaller than 1 MB.');
      const parsed = parseTaskCsv(await file.text());
      const projectTaskIds = new Set(tasks.map((task) => task.id));
      const foreignIds = parsed.filter((row) => row.id && !projectTaskIds.has(row.id));
      if (foreignIds.length) throw new Error('This project import can only update task IDs already in this project. Remove those rows or choose a different CSV.');
      setImportRows(parsed);
      setImportFileName(file.name);
      setImportMode('CREATE');
    } catch (reason) {
      setImportRows([]); setImportFileName('');
      setError(reason instanceof Error ? reason.message : 'Could not read this CSV file.');
    }
  }

  async function importProjectTaskCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project || importRows.length === 0) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const scopedRows = importRows.map((row) => ({ ...row, projectId: project.id, ...(importMode === 'CREATE' ? { id: null } : {}) }));
      const result = await request(`/workspaces/${workspace.id}/tasks/import`, { method: 'POST', body: JSON.stringify({ mode: importMode, projectId: project.id, tasks: scopedRows }) }) as { created: number; updated: number; unchanged: number };
      setImportRows([]); setImportFileName(''); setImportMode('CREATE');
      await reload();
      setNotice(`CSV import complete: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import these project tasks.'); }
    finally { setSaving(false); }
  }

  async function updateTaskLabels(taskId: string, labels: string[]) {
    setSaving(true); setError('');
    try { await request(`/workspaces/${workspace.id}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ labels }) }); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update task labels.'); }
    finally { setSaving(false); }
  }

  async function updateDependencies(taskId: string, selectedIds: string[]) {
    setSaving(true); setError('');
    try { await request(`/workspaces/${workspace.id}/tasks/${taskId}/dependencies`, { method: 'PUT', body: JSON.stringify({ dependsOnTaskIds: selectedIds }) }); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update task prerequisites.'); }
    finally { setSaving(false); }
  }

  async function createMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects/${projectId}/milestones`, { method: 'POST', body: JSON.stringify({ title: form.get('title'), dueAt: form.get('dueAt') || null }) });
      formElement.reset();
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create this milestone.'); }
    finally { setSaving(false); }
  }

  async function updateMilestone(milestone: Milestone, changes: { completed?: boolean; dueAt?: string | null }) {
    setSaving(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects/${projectId}/milestones/${milestone.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this milestone.'); }
    finally { setSaving(false); }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/tasks`, { method: 'POST', body: JSON.stringify({ projectId, title: form.get('title'), description: form.get('description') || null, priority: form.get('priority'), assigneeId: form.get('assigneeId') || null, dueAt: form.get('dueAt') || null }) });
      formElement.reset();
      setShowTaskForm(false);
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create this task.'); }
    finally { setSaving(false); }
  }

  async function bulkUpdateProjectTasks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTaskIds.length) return;
    const form = new FormData(event.currentTarget);
    const payload: Record<string, string | string[] | null> = { taskIds: selectedTaskIds };
    for (const field of ['status', 'priority'] as const) {
      const value = form.get(field);
      if (typeof value === 'string' && value) payload[field] = value;
    }
    const assignee = form.get('assigneeId');
    if (assignee === '__CLEAR__') payload.assigneeId = null;
    else if (typeof assignee === 'string' && assignee) payload.assigneeId = assignee;
    const dueMode = form.get('dueMode');
    const dueAt = form.get('dueAt');
    if (dueMode === 'CLEAR') payload.dueAt = null;
    else if (dueMode === 'SET' && typeof dueAt === 'string' && dueAt) payload.dueAt = dueAt;
    else if (dueMode === 'SET') { setError('Choose a due date to apply.'); return; }
    if (Object.keys(payload).length === 1) { setError('Choose at least one task field to update.'); return; }
    setSaving(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/tasks/bulk`, { method: 'PATCH', body: JSON.stringify(payload) });
      setSelectedTaskIds([]);
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the selected tasks.'); }
    finally { setSaving(false); }
  }

  async function deleteMilestone(milestone: Milestone) {
    if (!window.confirm(`Remove the milestone “${milestone.title}” from this project?`)) return;
    setSaving(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects/${projectId}/milestones/${milestone.id}`, { method: 'DELETE' });
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not remove this milestone.'); }
    finally { setSaving(false); }
  }

  const tabs = [
    { key: 'OVERVIEW', label: 'Overview' }, { key: 'TIMELINE', label: 'Timeline' },
    { key: 'DOCUMENTS', label: `Documents${documents.length ? ` · ${documents.length}` : ''}` },
    { key: 'FILES', label: 'Files' }, { key: 'ACTIVITY', label: 'Activity' }, { key: 'BUDGET', label: 'Budget' },
  ] as const;

  return (
    <div className="workspace-section-page project-hub">
      <p className="workspace-eyebrow"><Link href="/workspace/projects">Projects</Link> · {workspace.name}</p>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      {notice && <p className="productivity-success" role="status">{notice}</p>}
      {loading ? <p className="productivity-message">Loading project…</p> : !project ? <div className="workspace-section-empty"><h2>Project unavailable</h2><p>This project is not available in the current workspace.</p><Link href="/workspace/projects">Back to projects</Link></div> : <>
        <header className="project-hub__hero"><div><span className={`project-status-pill project-status-pill--${project.status.toLowerCase()}`}>{project.status.replaceAll('_', ' ').toLowerCase()}</span><h1>{project.name}</h1><p>{project.description || 'A project workspace for plans, documents, and delivery.'}</p></div><div className="project-hub__hero-actions"><button type="button" aria-expanded={showProjectEditor} onClick={() => setShowProjectEditor((value) => !value)}>{showProjectEditor ? 'Close editor' : 'Edit project'}</button><Link href="/workspace/projects" className="project-hub__back">← All projects</Link><FavouriteStar kind="PROJECT" entityId={project.id} /></div></header>
        {showProjectEditor && <form key={`${project.id}-${project.name}-${project.status}-${project.dueAt ?? ''}`} className="project-hub__project-editor" onSubmit={saveProjectDetails}><label>Project name<input name="name" required maxLength={160} defaultValue={project.name} /></label><label>Description<textarea name="description" rows={3} maxLength={5000} defaultValue={project.description ?? ''} /></label><div><label>Status<select name="status" defaultValue={project.status}><option value="PLANNING">Planning</option><option value="IN_PROGRESS">In progress</option><option value="ON_HOLD">On hold</option><option value="COMPLETED">Completed</option><option value="ARCHIVED">Archived</option></select></label><label>Project deadline<input name="dueAt" type="date" defaultValue={project.dueAt?.slice(0, 10) ?? ''} /></label></div><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save project details'}</button></form>}
        <nav className="project-hub__tabs" aria-label="Project sections">{tabs.map((item) => <button type="button" key={item.key} className={tab === item.key ? 'is-active' : ''} aria-current={tab === item.key ? 'page' : undefined} onClick={() => setTab(item.key)}>{item.label}</button>)}</nav>

        {tab === 'OVERVIEW' && <>
          <section className="project-hub__stats" aria-label="Project summary">
            <article><span>Task progress</span><strong>{progress}%</strong><div className="project-hub__progress"><span style={{ width: `${progress}%` }} /></div><small>{completedCount} of {tasks.length} tasks done</small></article>
            <article><span>Ready to start</span><strong>{readyTasks.length}</strong><small>Prerequisites complete</small></article>
            <article><span>Blocked</span><strong className={blockedTasks.length ? 'project-hub__blocked-count' : ''}>{blockedTasks.length}</strong><small>Waiting on prerequisites</small></article>
            <article><span>Overdue</span><strong className={overdueTasks.length + overdueMilestones.length ? 'project-hub__blocked-count' : ''}>{overdueTasks.length + overdueMilestones.length}</strong><small>Tasks and milestones</small></article>
            <article><span>Milestones</span><strong>{milestones.filter((item) => item.completedAt).length}/{milestones.length}</strong><small>Completed checkpoints</small></article>
            <article><span>Deadline</span><strong className="project-hub__date">{formatDate(project.dueAt)}</strong><small>Project target</small></article>
          </section>
          {(overdueTasks.length > 0 || overdueMilestones.length > 0 || upcomingMilestones.length > 0 || dueSoonTasks.length > 0) && <section className="project-hub__attention"><div className="project-hub__panel-heading"><div><p className="workspace-eyebrow">DATES AND DELIVERY</p><h2>Needs attention</h2></div><button type="button" onClick={() => setTab('TIMELINE')}>Open timeline →</button></div><div className="project-hub__attention-grid">{overdueTasks.slice(0, 5).map((task) => <article className="is-overdue" key={task.id}><span>Overdue task</span><Link href={`/workspace/tasks/${task.id}`}>{task.title}</Link><small>Due {formatDate(task.dueAt)}</small></article>)}{overdueMilestones.slice(0, 3).map((milestone) => <article className="is-overdue" key={milestone.id}><span>Overdue milestone</span><strong>{milestone.title}</strong><small>Due {formatDate(milestone.dueAt)}</small></article>)}{dueSoonTasks.slice(0, 5).map((task) => <article key={task.id}><span>Due this week</span><Link href={`/workspace/tasks/${task.id}`}>{task.title}</Link><small>Due {formatDate(task.dueAt)}</small></article>)}{upcomingMilestones.slice(0, 3).map((milestone) => <article key={milestone.id}><span>Next milestone</span><strong>{milestone.title}</strong><small>{formatDate(milestone.dueAt)}</small></article>)}</div></section>}
          <section className="project-hub__ready-queue"><div className="project-hub__panel-heading"><div><p className="workspace-eyebrow">DEPENDENCY-AWARE QUEUE</p><h2>Ready next</h2></div><span>{readyTasks.length} ready · {blockedTasks.length} blocked</span></div>
            <div className="project-hub__ready-columns"><div>{readyTasks.length ? readyTasks.slice(0, 4).map((task) => <article key={task.id}><span className={`productivity-priority productivity-priority--${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span><Link href={`/workspace/tasks/${task.id}`}><strong>{task.title}</strong></Link><small>{task.assignee?.displayName ?? 'Unassigned'} · Due {formatDate(task.dueAt)}</small>{task.status === 'TODO' ? <button type="button" disabled={saving} onClick={() => void updateTaskStatus(task.id, 'IN_PROGRESS')}>{saving ? 'Starting…' : 'Start task →'}</button> : <span className="project-hub__ready-state">Already in progress</span>}</article>) : <p className="productivity-message">No ready tasks right now. Complete prerequisites or add an open task to this project.</p>}</div>
              <div className="project-hub__blocked-list"><h3>Waiting on</h3>{blockedTasks.length ? blockedTasks.slice(0, 4).map((task) => <article key={task.id}><Link href={`/workspace/tasks/${task.id}`}><strong>{task.title}</strong></Link><small>Blocked by {task.dependsOn.filter((item) => item.status !== 'COMPLETED').map((item) => item.title).join(', ')}</small></article>) : <p>No tasks are waiting on prerequisites.</p>}</div>
            </div>
          </section>
          <div className="project-hub__overview-grid">
            <section className="project-hub__panel"><div className="project-hub__panel-heading"><div><p className="workspace-eyebrow">DELIVERY · SEQUENCING</p><h2>Project tasks</h2></div><div className="project-hub__task-actions"><button type="button" onClick={exportProjectTasks} disabled={!tasks.length}>Export CSV</button><button type="button" onClick={() => setTab('TIMELINE')}>View timeline →</button><button type="button" aria-expanded={showTaskForm} onClick={() => setShowTaskForm((value) => !value)}>{showTaskForm ? 'Close' : '＋ Add task'}</button></div></div>
              <form className="project-task-import" onSubmit={importProjectTaskCsv}><label>Import task CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void readProjectTaskCsv(event)} /></label>{importFileName && <div className="project-task-import__preview"><strong>{importFileName}</strong><span>{importRows.length} rows · {importRows.filter((row) => row.id).length} existing project tasks match</span><small>{importRows.slice(0, 3).map((row) => row.title).join(' · ')}{importRows.length > 3 ? ' …' : ''}</small><label>Import behavior<select value={importMode} onChange={(event) => setImportMode(event.target.value as typeof importMode)}><option value="CREATE">Create new tasks</option><option value="UPSERT" disabled={!importRows.some((row) => row.id)}>Update matching IDs and create new rows</option></select></label><button type="submit" disabled={saving || !importRows.length}>{saving ? 'Importing…' : importMode === 'UPSERT' ? 'Sync CSV changes' : 'Import tasks'}</button><button type="button" onClick={() => { setImportRows([]); setImportFileName(''); setImportMode('CREATE'); }}>Cancel</button></div>}<small>Imports are limited to 200 rows and 1 MB. Task IDs must belong to this project; new rows are always assigned here.</small></form>
              {showTaskForm && <form className="project-hub__task-create" onSubmit={createTask}><label>Task name<input name="title" required maxLength={200} placeholder="Describe the next action" /></label><label>Description <span>(optional)</span><textarea name="description" rows={2} maxLength={5000} placeholder="Add context or acceptance notes" /></label><div><label>Priority<select name="priority" defaultValue="MEDIUM"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label><label>Assignee<select name="assigneeId" defaultValue=""><option value="">Unassigned</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label><label>Due date<input name="dueAt" type="date" /></label></div><button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create task'}</button></form>}
              {tasks.length > 0 && <div className="project-hub__task-filters"><label>Find tasks<input type="search" value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} placeholder="Search title, assignee, label" /></label><label>Status<select value={taskFilter} onChange={(event) => setTaskFilter(event.target.value as typeof taskFilter)}><option value="ALL">All tasks</option><option value="OPEN">Open</option><option value="BLOCKED">Blocked</option><option value="OVERDUE">Overdue</option><option value="COMPLETED">Completed</option></select></label><label>Priority<select value={taskPriorityFilter} onChange={(event) => setTaskPriorityFilter(event.target.value)}><option value="ALL">All priorities</option><option value="URGENT">Urgent</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></label></div>}
              {tasks.length > 0 && <div className="project-hub__bulk-tools"><label><input type="checkbox" checked={visibleProjectTasks.length > 0 && visibleProjectTasks.every((task) => selectedTaskIds.includes(task.id))} onChange={(event) => setSelectedTaskIds((current) => event.target.checked ? [...new Set([...current, ...visibleProjectTasks.map((task) => task.id)])] : current.filter((id) => !visibleProjectTasks.some((task) => task.id === id)))} />Select {visibleProjectTasks.length} visible tasks</label>{selectedTaskIds.length > 0 && <form onSubmit={bulkUpdateProjectTasks}><strong>{selectedTaskIds.length} selected</strong><select name="status" defaultValue=""><option value="">Status unchanged</option>{taskStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select><select name="priority" defaultValue=""><option value="">Priority unchanged</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select><select name="assigneeId" defaultValue=""><option value="">Assignee unchanged</option><option value="__CLEAR__">Unassign</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select><select name="dueMode" defaultValue=""><option value="">Dates unchanged</option><option value="SET">Set due date</option><option value="CLEAR">Clear due dates</option></select><input aria-label="Due date for selected tasks" name="dueAt" type="date" /><button type="submit" disabled={saving}>{saving ? 'Updating…' : 'Apply changes'}</button><button type="button" disabled={saving} onClick={() => setSelectedTaskIds([])}>Clear selection</button></form>}</div>}
              {tasks.length === 0 ? <p className="productivity-message">Create tasks from the Projects page to start tracking delivery.</p> : visibleProjectTasks.length === 0 ? <p className="productivity-message">No tasks match these filters. Adjust the search or choose another status or priority.</p> : <div className="project-hub__task-list">{visibleProjectTasks.map((task) => <article key={task.id}><label className="project-hub__task-select"><input type="checkbox" checked={selectedTaskIds.includes(task.id)} onChange={(event) => setSelectedTaskIds((current) => event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id))} /><span className="visually-hidden">Select {task.title}</span></label><span className={`productivity-priority productivity-priority--${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span><div><Link href={`/workspace/tasks/${task.id}`}><strong>{task.title}</strong></Link><small>{task.assignee?.displayName ?? 'Unassigned'} · {formatDate(task.dueAt)}{task.dependsOn.length ? ` · ${task.dependsOn.filter((item) => item.status !== 'COMPLETED').length} open prerequisite(s)` : ''}</small><TaskLabels labels={task.labels} taskTitle={task.title} disabled={saving} onSave={(labels) => void updateTaskLabels(task.id, labels)} compact /></div><label><span className="visually-hidden">Status for {task.title}</span><select value={task.status} disabled={saving} onChange={(event) => void updateTaskStatus(task.id, event.target.value)}>{taskStatuses.map((status) => <option value={status.value} key={status.value}>{status.label}</option>)}</select></label><details className="project-hub__dependency"><summary>Prerequisites · {task.dependsOn.length}</summary><div>{tasks.filter((candidate) => candidate.id !== task.id).map((candidate) => <label key={candidate.id}><input type="checkbox" checked={task.dependsOn.some((item) => item.id === candidate.id)} disabled={saving || task.status === 'COMPLETED'} onChange={(event) => void updateDependencies(task.id, event.currentTarget.checked ? [...task.dependsOn.map((item) => item.id), candidate.id] : task.dependsOn.filter((item) => item.id !== candidate.id).map((item) => item.id))} /><span>{candidate.title}{candidate.status === 'COMPLETED' ? ' · done' : ''}</span></label>)}</div></details></article>)}</div>}
            </section>
            <section className="project-hub__panel"><div className="project-hub__panel-heading"><div><p className="workspace-eyebrow">PROJECT RECORDS</p><h2>Documents & milestones</h2></div></div>
              <div className="project-hub__quick-list"><button type="button" onClick={() => setTab('DOCUMENTS')}><span>▤</span><strong>{documents.length} linked documents</strong><small>Briefs, plans, and notes</small></button><button type="button" onClick={() => setTab('TIMELINE')}><span>◆</span><strong>{milestones.length} milestones</strong><small>Dated project checkpoints</small></button><button type="button" onClick={() => setTab('ACTIVITY')}><span>◷</span><strong>{activity.length} recent updates</strong><small>Project history</small></button></div>
            </section>
          </div>
          <section className="project-hub__budget-strip"><div><p className="workspace-eyebrow">BUDGET</p><strong>{project.budgetTotalCents === null ? 'Not set' : `${currency.format(project.budgetSpentCents / 100)} / ${currency.format(project.budgetTotalCents / 100)}`}</strong></div><div className="project-hub__progress"><span style={{ width: `${project.budgetTotalCents ? Math.min(100, (project.budgetSpentCents / project.budgetTotalCents) * 100) : 0}%` }} /></div><button type="button" onClick={() => setTab('BUDGET')}>Manage budget →</button></section>
        </>}

        {tab === 'TIMELINE' && <>
          <section className="project-hub__panel project-hub__full-panel project-hub__milestone-manager"><div className="project-hub__panel-heading"><div><p className="workspace-eyebrow">PROJECT CHECKPOINTS</p><h2>Milestones</h2></div><span>{milestones.filter((item) => item.completedAt).length} of {milestones.length} complete</span></div>
            <form className="project-hub__milestone-create" onSubmit={createMilestone}><label>Milestone name<input name="title" required maxLength={160} placeholder="e.g. Design approved" /></label><label>Due date <span>(optional)</span><input name="dueAt" type="date" /></label><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add milestone'}</button></form>
            {milestones.length ? <ul className="project-hub__milestone-list">{milestones.map((milestone) => <li key={milestone.id} className={milestone.completedAt ? 'is-complete' : ''}><label className="project-hub__milestone-check"><input type="checkbox" checked={Boolean(milestone.completedAt)} disabled={saving} onChange={(event) => void updateMilestone(milestone, { completed: event.target.checked })} /><span>{milestone.title}</span></label><label className="project-hub__milestone-date"><span className="visually-hidden">Due date for {milestone.title}</span><input type="date" value={milestone.dueAt?.slice(0, 10) ?? ''} disabled={saving} onChange={(event) => void updateMilestone(milestone, { dueAt: event.target.value || null })} /></label><button type="button" className="project-hub__milestone-remove" disabled={saving} aria-label={`Remove ${milestone.title}`} onClick={() => void deleteMilestone(milestone)}>Remove</button></li>)}</ul> : <p className="productivity-message">No milestones yet. Add a checkpoint to make key outcomes visible on this timeline.</p>}
          </section>
          <section className="project-hub__panel project-hub__full-panel"><div className="project-hub__panel-heading"><div><p className="workspace-eyebrow">TASK DATES · MILESTONES</p><h2>Project timeline</h2></div><span>{timelineItems.length} scheduled items</span></div>
          <GanttChart tasks={tasks.filter((task) => task.status !== 'CANCELLED')} />
          {timelineItems.length === 0 ? <p className="productivity-message">Add due dates to tasks and milestones to build the project timeline.</p> : <div className="project-timeline">{timelineItems.map((item) => <article key={`${item.type}-${item.id}`} className={item.state === 'COMPLETED' ? 'is-complete' : ''}><time>{formatDate(item.date)}</time><span className={`project-timeline__marker project-timeline__marker--${item.type.toLowerCase()}`} /><div><small>{item.type} · {item.state.replaceAll('_', ' ').toLowerCase()}</small>{item.type === 'Task' ? <Link href={`/workspace/tasks/${item.id}`}><strong>{item.title}</strong></Link> : <strong>{item.title}</strong>}</div></article>)}</div>}
          </section>
        </>}

        {tab === 'DOCUMENTS' && <section className="project-hub__panel project-hub__full-panel"><div className="project-hub__panel-heading"><div><p className="workspace-eyebrow">PROJECT LIBRARY</p><h2>Linked documents</h2></div><Link href="/workspace/documents">Manage documents →</Link></div>
          {documents.length === 0 ? <div className="task-list-empty"><h3>No project documents yet.</h3><p>When you create a document, link it to this project to keep it close to the work.</p><Link href="/workspace/documents">Create a document</Link></div> : <div className="project-hub__document-list">{documents.map((document) => <article key={document.id}><span>▤</span><div><strong>{document.title}</strong><small>Updated {formatDate(document.updatedAt)}</small></div><Link href={`/workspace/documents/${document.id}`}>Open editor →</Link></article>)}</div>}
        </section>}

        {tab === 'FILES' && <section className="project-hub__panel project-hub__full-panel"><AttachmentsPanel target={{ projectId: project.id }} /></section>}

        {tab === 'ACTIVITY' && <section className="project-hub__panel project-hub__full-panel"><div className="project-hub__panel-heading"><div><p className="workspace-eyebrow">PROJECT HISTORY</p><h2>Recent activity</h2></div><Link href="/workspace/activity">Workspace activity →</Link></div>
          {activity.length === 0 ? <p className="productivity-message">Project changes will appear here as the team works.</p> : <ol className="project-hub__activity">{activity.map((item) => <li key={item.id}><span>{item.entityType === 'TASK' ? '✓' : item.entityType === 'DOCUMENT' ? '▤' : item.entityType === 'CALENDAR' ? '▦' : '◇'}</span><div><p><strong>{item.actor.displayName}</strong> {item.message}</p><small>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</small></div></li>)}</ol>}
        </section>}

        {tab === 'BUDGET' && <section className="project-hub__panel project-hub__full-panel"><div className="project-hub__panel-heading"><div><p className="workspace-eyebrow">MANUAL TRACKING</p><h2>Project budget</h2></div></div>
          <div className="project-hub__budget-large"><strong>{project.budgetTotalCents === null ? 'Set a project budget' : currency.format(project.budgetSpentCents / 100)}</strong><span>{project.budgetTotalCents === null ? 'Add a target and record spending as it happens.' : `of ${currency.format(project.budgetTotalCents / 100)} spent`}</span></div>
          {project.budgetTotalCents !== null && <div className="project-hub__budget-meter"><div className="project-hub__progress"><span style={{ width: `${project.budgetTotalCents ? Math.min(100, project.budgetSpentCents / project.budgetTotalCents * 100) : 0}%` }} /></div><span>{project.budgetTotalCents ? Math.round(project.budgetSpentCents / project.budgetTotalCents * 100) : 0}%</span><small>{Math.max(0, project.budgetTotalCents - project.budgetSpentCents) / 100 === 0 ? 'At or over budget' : `${currency.format(Math.max(0, project.budgetTotalCents - project.budgetSpentCents) / 100)} remaining`}</small></div>}
          <form key={`${project.id}-${project.budgetTotalCents}-${project.budgetSpentCents}`} className="project-hub__budget-form" onSubmit={saveBudget}><label>Total budget (AUD)<input name="budgetTotal" type="number" min="0" step="0.01" defaultValue={project.budgetTotalCents === null ? '' : (project.budgetTotalCents / 100).toFixed(2)} placeholder="e.g. 25000.00" /></label><label>Amount spent<input name="budgetSpent" type="number" min="0" step="0.01" required defaultValue={(project.budgetSpentCents / 100).toFixed(2)} /></label><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save budget'}</button></form>
          <p className="project-hub__budget-note">Budget values are entered manually and stored in Australian dollars. AVEN does not connect to accounting or payment systems.</p>
        </section>}
      </>}
    </div>
  );
}
