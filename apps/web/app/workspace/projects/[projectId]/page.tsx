'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from '../../workspace-shell';
import { TaskLabels } from '../../task-labels';

type Project = { id: string; name: string; description: string | null; status: string; dueAt: string | null; budgetTotalCents: number | null; budgetSpentCents: number };
type ProjectTask = { id: string; title: string; status: string; priority: string; labels: string[]; dueAt: string | null; project: { id: string; name: string } | null; assignee: { id: string; displayName: string } | null; events: { id: string }[]; dependsOn: { id: string; title: string; status: string }[]; blocks: { id: string; title: string; status: string }[] };
type ProjectDocument = { id: string; title: string; updatedAt: string; project: { id: string; name: string } | null };
type Milestone = { id: string; title: string; dueAt: string | null; completedAt: string | null };
type ActivityEntry = { id: string; entityType: string; entityId: string; message: string; createdAt: string; actor: { displayName: string } };
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
  const [tab, setTab] = useState<'OVERVIEW' | 'TIMELINE' | 'DOCUMENTS' | 'ACTIVITY' | 'BUDGET'>('OVERVIEW');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    const [projectRows, taskRows, documentRows, activityRows, milestoneRows] = await Promise.all([
      request(`/workspaces/${workspace.id}/projects`) as Promise<Project[]>,
      request(`/workspaces/${workspace.id}/tasks`) as Promise<ProjectTask[]>,
      request(`/workspaces/${workspace.id}/documents`) as Promise<ProjectDocument[]>,
      request(`/workspaces/${workspace.id}/activity`) as Promise<ActivityEntry[]>,
      request(`/workspaces/${workspace.id}/projects/${projectId}/milestones`) as Promise<Milestone[]>,
    ]);
    const selected = projectRows.find((item) => item.id === projectId);
    if (!selected) throw new Error('This project could not be found in the current workspace.');
    const projectTasks = taskRows.filter((item) => item.project?.id === projectId);
    const projectDocuments = documentRows.filter((item) => item.project?.id === projectId);
    const relatedIds = new Set([selected.id, ...projectTasks.map((item) => item.id), ...projectTasks.flatMap((item) => item.events.map((event) => event.id)), ...projectDocuments.map((item) => item.id), ...milestoneRows.map((item) => item.id)]);
    setProject(selected);
    setTasks(projectTasks);
    setDocuments(projectDocuments);
    setMilestones(milestoneRows);
    setActivity(activityRows.filter((item) => relatedIds.has(item.entityId)));
  }, [projectId, request, workspace.id]);

  useEffect(() => {
    let cancelled = false;
    void reload().catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load project workspace.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  const completedCount = tasks.filter((task) => task.status === 'COMPLETED').length;
  const openTasks = tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED');
  const blockedTasks = openTasks.filter((task) => task.dependsOn.some((item) => item.status !== 'COMPLETED'));
  const readyTasks = openTasks.filter((task) => !task.dependsOn.some((item) => item.status !== 'COMPLETED'))
    .sort((a, b) => {
      const priorityRank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return priorityRank[a.priority] - priorityRank[b.priority] || (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.title.localeCompare(b.title);
    });
  const progress = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  const timelineItems = useMemo(() => [
    ...tasks.filter((task) => task.dueAt).map((task) => ({ id: task.id, title: task.title, date: task.dueAt as string, type: 'Task', state: task.status })),
    ...milestones.filter((milestone) => milestone.dueAt).map((milestone) => ({ id: milestone.id, title: milestone.title, date: milestone.dueAt as string, type: 'Milestone', state: milestone.completedAt ? 'COMPLETED' : 'UPCOMING' })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [milestones, tasks]);

  async function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!project) return;
    const form = new FormData(event.currentTarget);
    setSaving(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ budgetTotal: form.get('budgetTotal') || null, budgetSpent: form.get('budgetSpent') }) });
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the project budget.'); }
    finally { setSaving(false); }
  }

  async function updateTaskStatus(taskId: string, status: string) {
    setSaving(true); setError('');
    try { await request(`/workspaces/${workspace.id}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this task.'); }
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

  const tabs = [
    { key: 'OVERVIEW', label: 'Overview' }, { key: 'TIMELINE', label: 'Timeline' },
    { key: 'DOCUMENTS', label: `Documents${documents.length ? ` · ${documents.length}` : ''}` },
    { key: 'ACTIVITY', label: 'Activity' }, { key: 'BUDGET', label: 'Budget' },
  ] as const;

  return (
    <div className="workspace-section-page project-hub">
      <p className="workspace-eyebrow"><Link href="/workspace/projects">Projects</Link> · {workspace.name}</p>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      {loading ? <p className="productivity-message">Loading project…</p> : !project ? <div className="workspace-section-empty"><h2>Project unavailable</h2><p>This project is not available in the current workspace.</p><Link href="/workspace/projects">Back to projects</Link></div> : <>
        <header className="project-hub__hero"><div><span className={`project-status-pill project-status-pill--${project.status.toLowerCase()}`}>{project.status.replaceAll('_', ' ').toLowerCase()}</span><h1>{project.name}</h1><p>{project.description || 'A project workspace for plans, documents, and delivery.'}</p></div><Link href="/workspace/projects" className="project-hub__back">← All projects</Link></header>
        <nav className="project-hub__tabs" aria-label="Project sections">{tabs.map((item) => <button type="button" key={item.key} className={tab === item.key ? 'is-active' : ''} aria-current={tab === item.key ? 'page' : undefined} onClick={() => setTab(item.key)}>{item.label}</button>)}</nav>

        {tab === 'OVERVIEW' && <>
          <section className="project-hub__stats" aria-label="Project summary">
            <article><span>Task progress</span><strong>{progress}%</strong><div className="project-hub__progress"><span style={{ width: `${progress}%` }} /></div><small>{completedCount} of {tasks.length} tasks done</small></article>
            <article><span>Ready to start</span><strong>{readyTasks.length}</strong><small>Prerequisites complete</small></article>
            <article><span>Blocked</span><strong className={blockedTasks.length ? 'project-hub__blocked-count' : ''}>{blockedTasks.length}</strong><small>Waiting on prerequisites</small></article>
            <article><span>Milestones</span><strong>{milestones.filter((item) => item.completedAt).length}/{milestones.length}</strong><small>Completed checkpoints</small></article>
            <article><span>Deadline</span><strong className="project-hub__date">{formatDate(project.dueAt)}</strong><small>Project target</small></article>
          </section>
          <section className="project-hub__ready-queue"><div className="project-hub__panel-heading"><div><p className="workspace-eyebrow">DEPENDENCY-AWARE QUEUE</p><h2>Ready next</h2></div><span>{readyTasks.length} ready · {blockedTasks.length} blocked</span></div>
            <div className="project-hub__ready-columns"><div>{readyTasks.length ? readyTasks.slice(0, 4).map((task) => <article key={task.id}><span className={`productivity-priority productivity-priority--${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span><Link href={`/workspace/tasks/${task.id}`}><strong>{task.title}</strong></Link><small>{task.assignee?.displayName ?? 'Unassigned'} · Due {formatDate(task.dueAt)}</small>{task.status === 'TODO' ? <button type="button" disabled={saving} onClick={() => void updateTaskStatus(task.id, 'IN_PROGRESS')}>{saving ? 'Starting…' : 'Start task →'}</button> : <span className="project-hub__ready-state">Already in progress</span>}</article>) : <p className="productivity-message">No ready tasks right now. Complete prerequisites or add an open task to this project.</p>}</div>
              <div className="project-hub__blocked-list"><h3>Waiting on</h3>{blockedTasks.length ? blockedTasks.slice(0, 4).map((task) => <article key={task.id}><Link href={`/workspace/tasks/${task.id}`}><strong>{task.title}</strong></Link><small>Blocked by {task.dependsOn.filter((item) => item.status !== 'COMPLETED').map((item) => item.title).join(', ')}</small></article>) : <p>No tasks are waiting on prerequisites.</p>}</div>
            </div>
          </section>
          <div className="project-hub__overview-grid">
            <section className="project-hub__panel"><div className="project-hub__panel-heading"><div><p className="workspace-eyebrow">DELIVERY · SEQUENCING</p><h2>Project tasks</h2></div><button type="button" onClick={() => setTab('TIMELINE')}>View timeline →</button></div>
              {tasks.length === 0 ? <p className="productivity-message">Create tasks from the Projects page to start tracking delivery.</p> : <div className="project-hub__task-list">{tasks.slice().sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999')).map((task) => <article key={task.id}><span className={`productivity-priority productivity-priority--${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span><div><Link href={`/workspace/tasks/${task.id}`}><strong>{task.title}</strong></Link><small>{task.assignee?.displayName ?? 'Unassigned'} · {formatDate(task.dueAt)}{task.dependsOn.length ? ` · ${task.dependsOn.filter((item) => item.status !== 'COMPLETED').length} open prerequisite(s)` : ''}</small><TaskLabels labels={task.labels} taskTitle={task.title} disabled={saving} onSave={(labels) => void updateTaskLabels(task.id, labels)} compact /></div><label><span className="visually-hidden">Status for {task.title}</span><select value={task.status} disabled={saving} onChange={(event) => void updateTaskStatus(task.id, event.target.value)}>{taskStatuses.map((status) => <option value={status.value} key={status.value}>{status.label}</option>)}</select></label><details className="project-hub__dependency"><summary>Prerequisites · {task.dependsOn.length}</summary><div>{tasks.filter((candidate) => candidate.id !== task.id).map((candidate) => <label key={candidate.id}><input type="checkbox" checked={task.dependsOn.some((item) => item.id === candidate.id)} disabled={saving || task.status === 'COMPLETED'} onChange={(event) => void updateDependencies(task.id, event.currentTarget.checked ? [...task.dependsOn.map((item) => item.id), candidate.id] : task.dependsOn.filter((item) => item.id !== candidate.id).map((item) => item.id))} /><span>{candidate.title}{candidate.status === 'COMPLETED' ? ' · done' : ''}</span></label>)}</div></details></article>)}</div>}
            </section>
            <section className="project-hub__panel"><div className="project-hub__panel-heading"><div><p className="workspace-eyebrow">PROJECT RECORDS</p><h2>Documents & milestones</h2></div></div>
              <div className="project-hub__quick-list"><button type="button" onClick={() => setTab('DOCUMENTS')}><span>▤</span><strong>{documents.length} linked documents</strong><small>Briefs, plans, and notes</small></button><button type="button" onClick={() => setTab('TIMELINE')}><span>◆</span><strong>{milestones.length} milestones</strong><small>Dated project checkpoints</small></button><button type="button" onClick={() => setTab('ACTIVITY')}><span>◷</span><strong>{activity.length} recent updates</strong><small>Project history</small></button></div>
            </section>
          </div>
          <section className="project-hub__budget-strip"><div><p className="workspace-eyebrow">BUDGET</p><strong>{project.budgetTotalCents === null ? 'Not set' : `${currency.format(project.budgetSpentCents / 100)} / ${currency.format(project.budgetTotalCents / 100)}`}</strong></div><div className="project-hub__progress"><span style={{ width: `${project.budgetTotalCents ? Math.min(100, (project.budgetSpentCents / project.budgetTotalCents) * 100) : 0}%` }} /></div><button type="button" onClick={() => setTab('BUDGET')}>Manage budget →</button></section>
        </>}

        {tab === 'TIMELINE' && <section className="project-hub__panel project-hub__full-panel"><div className="project-hub__panel-heading"><div><p className="workspace-eyebrow">TASK DATES · MILESTONES</p><h2>Project timeline</h2></div><span>{timelineItems.length} scheduled items</span></div>
          {timelineItems.length === 0 ? <p className="productivity-message">Add due dates to tasks and milestones to build the project timeline.</p> : <div className="project-timeline">{timelineItems.map((item) => <article key={`${item.type}-${item.id}`} className={item.state === 'COMPLETED' ? 'is-complete' : ''}><time>{formatDate(item.date)}</time><span className={`project-timeline__marker project-timeline__marker--${item.type.toLowerCase()}`} /><div><small>{item.type} · {item.state.replaceAll('_', ' ').toLowerCase()}</small>{item.type === 'Task' ? <Link href={`/workspace/tasks/${item.id}`}><strong>{item.title}</strong></Link> : <strong>{item.title}</strong>}</div></article>)}</div>}
        </section>}

        {tab === 'DOCUMENTS' && <section className="project-hub__panel project-hub__full-panel"><div className="project-hub__panel-heading"><div><p className="workspace-eyebrow">PROJECT LIBRARY</p><h2>Linked documents</h2></div><Link href="/workspace/documents">Manage documents →</Link></div>
          {documents.length === 0 ? <div className="task-list-empty"><h3>No project documents yet.</h3><p>When you create a document, link it to this project to keep it close to the work.</p><Link href="/workspace/documents">Create a document</Link></div> : <div className="project-hub__document-list">{documents.map((document) => <article key={document.id}><span>▤</span><div><strong>{document.title}</strong><small>Updated {formatDate(document.updatedAt)}</small></div><Link href={`/workspace/documents/${document.id}`}>Open editor →</Link></article>)}</div>}
        </section>}

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
