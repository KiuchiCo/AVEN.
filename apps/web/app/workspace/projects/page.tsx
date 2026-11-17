'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from '../workspace-shell';

type Project = { id: string; name: string; description: string | null; status: string; dueAt: string | null; taskCount: number };
type Task = { id: string; title: string; description: string | null; status: string; priority: string; dueAt: string | null; project: { id: string; name: string } | null };
type Milestone = { id: string; title: string; dueAt: string | null; completedAt: string | null };

const columns = [
  { status: 'TODO', title: 'To do' },
  { status: 'IN_PROGRESS', title: 'In progress' },
  { status: 'IN_REVIEW', title: 'In review' },
  { status: 'COMPLETED', title: 'Completed' },
];
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

export default function ProjectsPage() {
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API. Check your local API setup.');
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(body?.message ?? 'AVEN could not save that change. Please try again.');
    }
    return response.status === 204 ? null : response.json();
  }, [getToken]);

  const reload = useCallback(async () => {
    const [projectRows, taskRows] = await Promise.all([
      request(`/workspaces/${workspace.id}/projects`),
      request(`/workspaces/${workspace.id}/tasks`),
    ]) as [Project[], Task[]];
    setProjects(projectRows);
    setTasks(taskRows);
    setSelectedProject((current) => current || projectRows[0]?.id || '');
  }, [request, workspace.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await reload();
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load workspace projects.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedProject) { setMilestones([]); return; }
    void request(`/workspaces/${workspace.id}/projects/${selectedProject}/milestones`)
      .then((rows: Milestone[]) => { if (!cancelled) setMilestones(rows); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load project milestones.'); });
    return () => { cancelled = true; };
  }, [request, selectedProject, workspace.id]);

  const selectedProjectName = useMemo(() => projects.find((project) => project.id === selectedProject)?.name, [projects, selectedProject]);
  const selectedProjectTasks = useMemo(() => tasks.filter((task) => task.project?.id === selectedProject), [tasks, selectedProject]);
  const completedTasks = selectedProjectTasks.filter((task) => task.status === 'COMPLETED').length;
  const taskProgress = selectedProjectTasks.length ? Math.round((completedTasks / selectedProjectTasks.length) * 100) : 0;

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name: form.get('name'), description: form.get('description') || undefined, status: form.get('status'), dueAt: form.get('dueAt') || undefined }),
      });
      formElement.reset();
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the project.');
    } finally { setBusy(false); }
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title: form.get('title'), projectId: form.get('projectId') || undefined, priority: form.get('priority'), dueAt: form.get('dueAt') || undefined }),
      });
      formElement.reset();
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the task.');
    } finally { setBusy(false); }
  }

  async function changeStatus(task: Task, status: string) {
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update the task.');
    } finally { setBusy(false); }
  }

  async function updateProject(project: Project, field: 'status' | 'dueAt', value: string) {
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ [field]: value || null }) });
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update the project.');
    } finally { setBusy(false); }
  }

  async function updateTask(task: Task, field: 'priority' | 'dueAt', value: string) {
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ [field]: value || null }) });
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update the task.');
    } finally { setBusy(false); }
  }

  async function submitMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects/${selectedProject}/milestones`, {
        method: 'POST', body: JSON.stringify({ title: form.get('title'), dueAt: form.get('dueAt') || undefined }),
      });
      formElement.reset();
      const rows = await request(`/workspaces/${workspace.id}/projects/${selectedProject}/milestones`) as Milestone[];
      setMilestones(rows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add the milestone.');
    } finally { setBusy(false); }
  }

  async function toggleMilestone(milestone: Milestone) {
    if (!selectedProject) return;
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects/${selectedProject}/milestones/${milestone.id}`, {
        method: 'PATCH', body: JSON.stringify({ completed: !milestone.completedAt }),
      });
      const rows = await request(`/workspaces/${workspace.id}/projects/${selectedProject}/milestones`) as Milestone[];
      setMilestones(rows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update the milestone.');
    } finally { setBusy(false); }
  }

  return (
    <div className="workspace-section-page productivity-page">
      <p className="workspace-eyebrow">YOUR WORKSPACE · {workspace.name}</p>
      <h1>Projects</h1>
      <p className="workspace-section-page__description">Plan work and track its next steps in one place.</p>

      {error && <p className="productivity-error" role="alert">{error}</p>}

      <div className="productivity-forms">
        <form className="productivity-form" onSubmit={submitProject}>
          <h2>New project</h2>
          <label>Project name<input name="name" maxLength={160} required placeholder="Website redesign" /></label>
          <label>Description <span>(optional)</span><input name="description" maxLength={5000} placeholder="What is this project for?" /></label>
          <div className="productivity-form__row"><label>Status<select name="status" defaultValue="PLANNING"><option value="PLANNING">Planning</option><option value="IN_PROGRESS">In progress</option><option value="ON_HOLD">On hold</option><option value="COMPLETED">Completed</option></select></label><label>Due date <span>(optional)</span><input name="dueAt" type="date" /></label></div>
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create project'}</button>
        </form>
        <form className="productivity-form" onSubmit={submitTask}>
          <h2>New task</h2>
          <label>Task name<input name="title" maxLength={200} required placeholder="Write the project brief" /></label>
          <div className="productivity-form__row">
            <label>Project<select name="projectId" value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <label>Priority<select name="priority" defaultValue="MEDIUM"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
          </div>
          <label>Due date <span>(optional)</span><input name="dueAt" type="date" /></label>
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create task'}</button>
        </form>
      </div>

      <section className="productivity-projects" aria-labelledby="projects-list-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">SAVED TO YOUR WORKSPACE</p><h2 id="projects-list-title">Your projects</h2></div><span>{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span></div>
        {loading ? <p className="productivity-message">Loading projects…</p> : projects.length === 0 ? (
          <p className="productivity-message">No projects yet. Create one above to start your first board.</p>
        ) : (
          <div className="productivity-project-list">{projects.map((project) => (
            <article key={project.id} className={`productivity-project${selectedProject === project.id ? ' productivity-project--active' : ''}`}>
              <button className="productivity-project__select" onClick={() => setSelectedProject(project.id)} aria-pressed={selectedProject === project.id}>
                <span><strong>{project.name}</strong><small>{project.description || 'A new AVEN project'}</small></span><span className="productivity-project__count">{project.taskCount} tasks</span>
              </button>
              <div className="productivity-project__controls"><label>Status <select value={project.status} disabled={busy} onChange={(event) => void updateProject(project, 'status', event.target.value)}><option value="PLANNING">Planning</option><option value="IN_PROGRESS">In progress</option><option value="ON_HOLD">On hold</option><option value="COMPLETED">Completed</option><option value="ARCHIVED">Archived</option></select></label><label>Due <input aria-label={`Due date for ${project.name}`} type="date" value={project.dueAt?.slice(0, 10) ?? ''} disabled={busy} onChange={(event) => void updateProject(project, 'dueAt', event.target.value)} /></label></div>
            </article>
          ))}</div>
        )}
      </section>

      {selectedProject && <section className="project-overview-panel" aria-labelledby="project-overview-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">PROJECT OVERVIEW</p><h2 id="project-overview-title">{selectedProjectName}</h2></div><span>{completedTasks} of {selectedProjectTasks.length} tasks complete</span></div>
        <div className="project-overview-progress"><div className="project-overview-progress__track"><span style={{ width: `${taskProgress}%` }} /></div><strong>{taskProgress}%</strong></div>
        <div className="project-milestones">
          <div className="project-milestones__heading"><h3>Milestones</h3><span>{milestones.filter((milestone) => milestone.completedAt).length} / {milestones.length} complete</span></div>
          {milestones.length === 0 ? <p className="productivity-message">Add milestones to mark the important checkpoints in this project.</p> : <ul>{milestones.map((milestone) => <li key={milestone.id} className={milestone.completedAt ? 'project-milestone--complete' : ''}><label><input type="checkbox" checked={Boolean(milestone.completedAt)} disabled={busy} onChange={() => void toggleMilestone(milestone)} /><span>{milestone.title}</span></label><time>{milestone.dueAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(milestone.dueAt)) : 'No date'}</time></li>)}</ul>}
          <form className="project-milestone-form" onSubmit={submitMilestone}><label className="visually-hidden" htmlFor="milestone-title">Milestone name</label><input id="milestone-title" name="title" maxLength={160} required placeholder="Add a project milestone" /><label className="visually-hidden" htmlFor="milestone-due">Milestone due date</label><input id="milestone-due" name="dueAt" type="date" /><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add milestone'}</button></form>
        </div>
      </section>}

      <section className="productivity-board" aria-labelledby="task-board-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">{selectedProjectName ? `PROJECT · ${selectedProjectName}` : 'WORKSPACE TASKS'}</p><h2 id="task-board-title">Task board</h2></div><label className="productivity-board__filter">Priority <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="ALL">All priorities</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label></div>
        {loading ? <p className="productivity-message">Loading tasks…</p> : (
          <div className="productivity-columns">{columns.map((column) => {
            const records = tasks.filter((task) => task.status === column.status && (!selectedProject || task.project?.id === selectedProject) && (priorityFilter === 'ALL' || task.priority === priorityFilter));
            return <section className="productivity-column" key={column.status} aria-label={`${column.title}, ${records.length} tasks`}>
              <h3>{column.title}<span>{records.length}</span></h3>
              {records.length === 0 ? <p className="productivity-column__empty">Nothing here yet</p> : records.map((task) => <article className="productivity-task" key={task.id}>
                <strong>{task.title}</strong>
                {task.project && <span className="productivity-task__project">{task.project.name}</span>}
                <div className="productivity-task__footer"><label className="visually-hidden" htmlFor={`priority-${task.id}`}>Priority for {task.title}</label><select className={`productivity-priority productivity-priority--${task.priority.toLowerCase()}`} id={`priority-${task.id}`} value={task.priority} disabled={busy} onChange={(event) => void updateTask(task, 'priority', event.target.value)}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select><label className="visually-hidden" htmlFor={`status-${task.id}`}>Status for {task.title}</label><select id={`status-${task.id}`} value={task.status} disabled={busy} onChange={(event) => void changeStatus(task, event.target.value)}>{columns.map((option) => <option key={option.status} value={option.status}>{option.title}</option>)}</select></div>
                <div className="productivity-task__due"><label htmlFor={`due-${task.id}`}>Due date</label><input id={`due-${task.id}`} type="date" value={task.dueAt?.slice(0, 10) ?? ''} disabled={busy} onChange={(event) => void updateTask(task, 'dueAt', event.target.value)} /><span className={task.dueAt && new Date(task.dueAt) < new Date(new Date().toDateString()) && task.status !== 'COMPLETED' ? 'productivity-task__overdue' : ''}>{task.dueAt && new Date(task.dueAt) < new Date(new Date().toDateString()) && task.status !== 'COMPLETED' ? 'Overdue' : ''}</span></div>
              </article>)}
            </section>;
          })}</div>
        )}
      </section>
    </div>
  );
}
