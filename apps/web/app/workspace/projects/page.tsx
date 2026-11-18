'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { TaskLabels } from '../task-labels';

type Project = { id: string; name: string; description: string | null; status: string; dueAt: string | null; taskCount: number };
type Member = { userId: string; displayName: string; role: string };
type Task = { id: string; title: string; description: string | null; status: string; priority: string; labels: string[]; dueAt: string | null; project: { id: string; name: string } | null; assignee: { id: string; displayName: string } | null };
type Milestone = { id: string; title: string; dueAt: string | null; completedAt: string | null };
type TaskImportRow = { title: string; description: string | null; status: string; priority: string; dueAt: string | null; labels: string[] };
type TemplateTask = { title: string; description: string | null; priority: string; labels: string[] };
type TemplateMilestone = { title: string };
type ProjectTemplate = { id: string; name: string; description: string | null; taskCount: number; milestoneCount: number; taskTemplates: TemplateTask[]; milestoneTemplates: TemplateMilestone[]; useCount: number; lastUsedAt: string | null; createdBy: { displayName: string } };

const columns = [
  { status: 'TODO', title: 'To do' },
  { status: 'IN_PROGRESS', title: 'In progress' },
  { status: 'IN_REVIEW', title: 'In review' },
  { status: 'COMPLETED', title: 'Completed' },
  { status: 'CANCELLED', title: 'Cancelled' },
];
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

export default function ProjectsPage() {
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState('');
  const [templateDraftName, setTemplateDraftName] = useState('');
  const [templateDraftDescription, setTemplateDraftDescription] = useState('');
  const [templateDraftTasks, setTemplateDraftTasks] = useState<TemplateTask[]>([]);
  const [templateDraftMilestones, setTemplateDraftMilestones] = useState<TemplateMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [bulkPriority, setBulkPriority] = useState('');
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [importRows, setImportRows] = useState<TaskImportRow[]>([]);
  const [importFileName, setImportFileName] = useState('');

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
    const [projectRows, taskRows, memberRows, templateRows] = await Promise.all([
      request(`/workspaces/${workspace.id}/projects`),
      request(`/workspaces/${workspace.id}/tasks`),
      request(`/workspaces/${workspace.id}/members`),
      request(`/workspaces/${workspace.id}/projects/project-templates`),
    ]) as [Project[], Task[], Member[], ProjectTemplate[]];
    setProjects(projectRows);
    setTasks(taskRows);
    setMembers(memberRows);
    setTemplates(templateRows);
    setSelectedProject((current) => projectRows.some((project) => project.id === current) ? current : projectRows[0]?.id || '');
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
  const boardTasks = useMemo(() => tasks.filter((task) => (!selectedProject || task.project?.id === selectedProject) && (priorityFilter === 'ALL' || task.priority === priorityFilter)), [tasks, selectedProject, priorityFilter]);
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
        body: JSON.stringify({ name: form.get('name'), description: form.get('description') || undefined, status: form.get('status'), dueAt: form.get('dueAt') || undefined, budgetTotal: form.get('budgetTotal') || undefined }),
      });
      formElement.reset();
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the project.');
    } finally { setBusy(false); }
  }

  async function saveSelectedTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects/${selectedProject}/template`, { method: 'POST', body: JSON.stringify({ name: form.get('templateName') }) });
      formElement.reset(); await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this project template.'); }
    finally { setBusy(false); }
  }

  async function applyTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTemplate) return;
    setBusy(true); setError('');
    try {
      const project = await request(`/workspaces/${workspace.id}/projects/project-templates/${selectedTemplate}/apply`, { method: 'POST', body: JSON.stringify({ name: newProjectName }) }) as Project & { id: string };
      setSelectedProject(project.id); setSelectedTaskIds([]); setSelectedTemplate(''); setNewProjectName(''); await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create a project from this template.'); }
    finally { setBusy(false); }
  }

  async function deleteTemplate(template: ProjectTemplate) {
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects/project-templates/${template.id}`, { method: 'DELETE' });
      if (selectedTemplate === template.id) { setSelectedTemplate(''); setNewProjectName(''); }
      if (editingTemplateId === template.id) setEditingTemplateId('');
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this template.'); }
    finally { setBusy(false); }
  }

  function editTemplate(template: ProjectTemplate) {
    setEditingTemplateId(template.id); setTemplateDraftName(template.name); setTemplateDraftDescription(template.description ?? '');
    setTemplateDraftTasks(template.taskTemplates.map((task) => ({ ...task })));
    setTemplateDraftMilestones(template.milestoneTemplates.map((milestone) => ({ ...milestone })));
  }

  async function saveTemplateEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects/project-templates/${editingTemplateId}`, {
        method: 'PATCH', body: JSON.stringify({ name: templateDraftName, description: templateDraftDescription || null, taskTemplates: templateDraftTasks, milestoneTemplates: templateDraftMilestones }),
      });
      setEditingTemplateId(''); await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this project template.'); }
    finally { setBusy(false); }
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title: form.get('title'), projectId: form.get('projectId') || undefined, assigneeId: form.get('assigneeId') || undefined, priority: form.get('priority'), dueAt: form.get('dueAt') || undefined }),
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

  async function updateTask(task: Task, field: 'priority' | 'dueAt' | 'assigneeId' | 'labels', value: string | string[]) {
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ [field]: field === 'labels' ? value : value || null }) });
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update the task.');
    } finally { setBusy(false); }
  }

  async function bulkUpdateSelectedTasks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTaskIds.length) return;
    const changes: Record<string, unknown> = {};
    if (bulkPriority) changes.priority = bulkPriority;
    if (bulkAssignee) changes.assigneeId = bulkAssignee === '__clear__' ? null : bulkAssignee;
    if (!Object.keys(changes).length) { setError('Choose a bulk priority or assignee change first.'); return; }
    setBusy(true); setError('');
    try {
      const result = await request(`/workspaces/${workspace.id}/tasks/bulk`, { method: 'PATCH', body: JSON.stringify({ taskIds: selectedTaskIds, ...changes }) }) as { updated: number };
      setSelectedTaskIds([]); setBulkPriority(''); setBulkAssignee(''); await reload();
      setNotice(`Updated ${result.updated} tasks.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the selected tasks.'); }
    finally { setBusy(false); }
  }

  function exportTasksCsv() {
    const header = ['title', 'description', 'status', 'priority', 'dueAt', 'labels'];
    const rows = boardTasks.map((task) => [task.title, task.description ?? '', task.status, task.priority, task.dueAt ?? '', task.labels.join(';')]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${selectedProjectName ? slug(selectedProjectName) : 'aven-workspace'}-tasks.csv`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function readTaskCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setError('');
    try {
      if (file.size > 1_000_000) throw new Error('CSV files must be smaller than 1 MB.');
      const parsed = parseTaskCsv(await file.text());
      setImportRows(parsed); setImportFileName(file.name);
    } catch (reason) { setImportRows([]); setImportFileName(''); setError(reason instanceof Error ? reason.message : 'Could not read this CSV file.'); }
  }

  async function importTasksCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importRows.length) return;
    const formElement = event.currentTarget;
    setBusy(true); setError('');
    try {
      const result = await request(`/workspaces/${workspace.id}/tasks/import`, { method: 'POST', body: JSON.stringify({ projectId: selectedProject || null, tasks: importRows }) }) as { imported: number };
      setImportRows([]); setImportFileName(''); formElement.reset(); await reload();
      setNotice(`Imported ${result.imported} tasks${selectedProjectName ? ` into ${selectedProjectName}` : ''}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import these tasks.'); }
    finally { setBusy(false); }
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
      {notice && <p className="productivity-success" role="status">{notice}</p>}

      <div className="productivity-forms">
        <form className="productivity-form" onSubmit={submitProject}>
          <h2>New project</h2>
          <label>Project name<input name="name" maxLength={160} required placeholder="Website redesign" /></label>
          <label>Description <span>(optional)</span><input name="description" maxLength={5000} placeholder="What is this project for?" /></label>
          <div className="productivity-form__row"><label>Status<select name="status" defaultValue="PLANNING"><option value="PLANNING">Planning</option><option value="IN_PROGRESS">In progress</option><option value="ON_HOLD">On hold</option><option value="COMPLETED">Completed</option></select></label><label>Due date <span>(optional)</span><input name="dueAt" type="date" /></label></div>
          <label>Budget <span>(optional, AUD)</span><input name="budgetTotal" type="number" min="0" step="0.01" placeholder="25000.00" /></label>
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create project'}</button>
        </form>
        <form className="productivity-form" onSubmit={submitTask}>
          <h2>New task</h2>
          <label>Task name<input name="title" maxLength={200} required placeholder="Write the project brief" /></label>
          <div className="productivity-form__row">
            <label>Project<select name="projectId" value={selectedProject} onChange={(event) => { setSelectedProject(event.target.value); setSelectedTaskIds([]); }}><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <label>Priority<select name="priority" defaultValue="MEDIUM"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
          </div>
          <label>Assign to <span>(optional)</span><select name="assigneeId" defaultValue=""><option value="">Unassigned</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label>
          <label>Due date <span>(optional)</span><input name="dueAt" type="date" /></label>
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create task'}</button>
        </form>
      </div>

      <section className="project-template-library" aria-labelledby="project-template-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">REPEATABLE WORKFLOWS</p><h2 id="project-template-title">Project templates</h2></div><span>{templates.length} saved</span></div>
        <p className="project-template-library__intro">Save a project’s description, tasks, priorities, and milestones as a starter. Up to 100 tasks and 50 milestones are copied; dates, assignees, and completion states are left fresh for each new project.</p>
        {selectedProject ? <form className="project-template-save" onSubmit={saveSelectedTemplate}><label>Save “{selectedProjectName}” as a template<input name="templateName" required maxLength={160} placeholder="e.g. Website launch" /></label><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save template'}</button></form> : <p className="productivity-message">Create a project first, then save it here as a reusable template.</p>}
        {templates.length === 0 ? <p className="productivity-message">No templates yet. Save a project above and reuse its setup in this workspace.</p> : <div className="project-template-grid">{templates.map((template) => <article className={`project-template-card${selectedTemplate === template.id ? ' project-template-card--selected' : ''}`} key={template.id}>
          <div><span className="workspace-eyebrow">PROJECT STARTER</span><h3>{template.name}</h3><p>{template.description || 'A reusable project setup for your workspace.'}</p></div>
          <div className="project-template-card__counts"><span>{template.taskCount} tasks</span><span>{template.milestoneCount} milestones</span><span>Used {template.useCount}×</span></div>
          {template.lastUsedAt && <small className="project-template-card__last-used">Last used {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(template.lastUsedAt))}</small>}
          <footer><button type="button" disabled={busy} onClick={() => editTemplate(template)}>{editingTemplateId === template.id ? 'Editing' : 'Edit'}</button><button type="button" disabled={busy} onClick={() => { setSelectedTemplate(template.id); setNewProjectName(`${template.name} project`); }}>{selectedTemplate === template.id ? 'Selected' : 'Use template'}</button><button type="button" disabled={busy} onClick={() => void deleteTemplate(template)}>Delete</button></footer>
        </article>)}</div>}
        {selectedTemplate && <form className="project-template-launch" onSubmit={applyTemplate}><div><strong>Start from {templates.find((template) => template.id === selectedTemplate)?.name}</strong><span>Creates a project with fresh, open tasks and milestones.</span></div><label>New project name<input required maxLength={160} value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} /></label><button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create project'}</button><button type="button" onClick={() => setSelectedTemplate('')}>Cancel</button></form>}
        {editingTemplateId && <form className="project-template-editor" onSubmit={saveTemplateEdits}>
          <div className="project-template-editor__heading"><div><p className="workspace-eyebrow">UPDATE YOUR STARTER</p><h3>Edit project template</h3></div><button type="button" onClick={() => setEditingTemplateId('')}>Cancel</button></div>
          <label>Template name<input required maxLength={160} value={templateDraftName} onChange={(event) => setTemplateDraftName(event.target.value)} /></label>
          <label>Project description<textarea maxLength={5000} rows={2} value={templateDraftDescription} onChange={(event) => setTemplateDraftDescription(event.target.value)} /></label>
          <div className="project-template-editor__section"><div><strong>Starter tasks</strong><button type="button" disabled={templateDraftTasks.length >= 100} onClick={() => setTemplateDraftTasks((rows) => [...rows, { title: '', description: null, priority: 'MEDIUM', labels: [] }])}>＋ Add task</button></div>
            {templateDraftTasks.length === 0 && <p>No starter tasks. Add a task or save an existing project with tasks.</p>}
            {templateDraftTasks.map((task, index) => <article key={index}><label>Task title<input required maxLength={200} value={task.title} onChange={(event) => setTemplateDraftTasks((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, title: event.target.value } : row))} /></label><label>Description<input maxLength={5000} value={task.description ?? ''} onChange={(event) => setTemplateDraftTasks((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, description: event.target.value || null } : row))} /></label><label>Priority<select value={task.priority} onChange={(event) => setTemplateDraftTasks((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, priority: event.target.value } : row))}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label><button type="button" aria-label={`Remove task ${index + 1}`} onClick={() => setTemplateDraftTasks((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></article>)}
          </div>
          <div className="project-template-editor__section"><div><strong>Milestones</strong><button type="button" disabled={templateDraftMilestones.length >= 50} onClick={() => setTemplateDraftMilestones((rows) => [...rows, { title: '' }])}>＋ Add milestone</button></div>
            {templateDraftMilestones.length === 0 && <p>No starter milestones. Add checkpoints for the new project.</p>}
            {templateDraftMilestones.map((milestone, index) => <article key={index}><label>Milestone title<input required maxLength={160} value={milestone.title} onChange={(event) => setTemplateDraftMilestones((rows) => rows.map((row, rowIndex) => rowIndex === index ? { title: event.target.value } : row))} /></label><button type="button" aria-label={`Remove milestone ${index + 1}`} onClick={() => setTemplateDraftMilestones((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></article>)}
          </div>
          <button className="project-template-editor__save" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save template changes'}</button>
        </form>}
      </section>

      <section className="productivity-projects" aria-labelledby="projects-list-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">SAVED TO YOUR WORKSPACE</p><h2 id="projects-list-title">Your projects</h2></div><span>{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span></div>
        {loading ? <p className="productivity-message">Loading projects…</p> : projects.length === 0 ? (
          <p className="productivity-message">No projects yet. Create one above to start your first board.</p>
        ) : (
          <div className="productivity-project-list">{projects.map((project) => (
            <article key={project.id} className={`productivity-project${selectedProject === project.id ? ' productivity-project--active' : ''}`}>
              <button className="productivity-project__select" onClick={() => { setSelectedProject(project.id); setSelectedTaskIds([]); }} aria-pressed={selectedProject === project.id}>
                <span><strong>{project.name}</strong><small>{project.description || 'A new AVEN project'}</small></span><span className="productivity-project__count">{project.taskCount} tasks</span>
              </button>
              <div className="productivity-project__controls"><label>Status <select value={project.status} disabled={busy} onChange={(event) => void updateProject(project, 'status', event.target.value)}><option value="PLANNING">Planning</option><option value="IN_PROGRESS">In progress</option><option value="ON_HOLD">On hold</option><option value="COMPLETED">Completed</option><option value="ARCHIVED">Archived</option></select></label><label>Due <input aria-label={`Due date for ${project.name}`} type="date" value={project.dueAt?.slice(0, 10) ?? ''} disabled={busy} onChange={(event) => void updateProject(project, 'dueAt', event.target.value)} /></label></div>
              <Link className="productivity-project__open" href={`/workspace/projects/${project.id}`}>Open project workspace <span aria-hidden="true">→</span></Link>
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

      <section className="project-workload-panel" aria-labelledby="project-workload-title">
        <div className="project-milestones__heading"><h2 id="project-workload-title">Workspace workload</h2><span>{tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED').length} open tasks</span></div>
        {members.length === 0 ? <p className="productivity-message">Workspace members will appear here when they join.</p> : <div className="project-workload-list">{members.map((member) => {
          const openCount = tasks.filter((task) => task.assignee?.id === member.userId && task.status !== 'COMPLETED' && task.status !== 'CANCELLED').length;
          const totalOpen = tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED').length;
          return <div className="project-workload-row" key={member.userId}><span className="project-workload-row__name"><strong>{member.displayName}</strong><small>{member.role.toLowerCase()}</small></span><span className="project-workload-row__track"><span style={{ width: `${totalOpen ? Math.max((openCount / totalOpen) * 100, openCount ? 5 : 0) : 0}%` }} /></span><strong>{openCount}</strong></div>;
        })}<p className="project-workload-unassigned">Unassigned · {tasks.filter((task) => !task.assignee && task.status !== 'COMPLETED' && task.status !== 'CANCELLED').length}</p></div>}
      </section>

      <section className="productivity-board" aria-labelledby="task-board-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">{selectedProjectName ? `PROJECT · ${selectedProjectName}` : 'WORKSPACE TASKS'}</p><h2 id="task-board-title">Task board</h2></div><label className="productivity-board__filter">Priority <select value={priorityFilter} onChange={(event) => { setPriorityFilter(event.target.value); setSelectedTaskIds([]); }}><option value="ALL">All priorities</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label></div>
        <div className="project-task-tools"><div className="project-task-tools__top"><span>{boardTasks.length} tasks in this view</span><div><button type="button" onClick={() => { setSelectedTaskIds(boardTasks.slice(0, 500).map((task) => task.id)); if (boardTasks.length > 500) setNotice('Selected the first 500 visible tasks; narrow the view to select a different batch.'); }}>Select visible (up to 500)</button><button type="button" disabled={!selectedTaskIds.length} onClick={() => setSelectedTaskIds([])}>Clear selection</button><button type="button" onClick={exportTasksCsv} disabled={!boardTasks.length}>Export CSV</button></div></div>
          {selectedTaskIds.length > 0 && <form className="project-task-bulk" onSubmit={bulkUpdateSelectedTasks}><strong>{selectedTaskIds.length} selected</strong><label>Set priority<select value={bulkPriority} onChange={(event) => setBulkPriority(event.target.value)}><option value="">Keep current</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label><label>Assign to<select value={bulkAssignee} onChange={(event) => setBulkAssignee(event.target.value)}><option value="">Keep current</option><option value="__clear__">Unassign</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label><button type="submit" disabled={busy}>{busy ? 'Updating…' : 'Apply changes'}</button></form>}
          <form className="project-task-import" onSubmit={importTasksCsv}><label>Import task CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void readTaskCsv(event)} /></label>{importFileName && <div className="project-task-import__preview"><strong>{importFileName}</strong><span>{importRows.length} tasks · {selectedProjectName ? `will be added to ${selectedProjectName}` : 'will be added to the workspace'}</span><small>{importRows.slice(0, 3).map((task) => task.title).join(' · ')}{importRows.length > 3 ? ' …' : ''}</small><button type="submit" disabled={busy || !importRows.length}>{busy ? 'Importing…' : 'Import tasks'}</button><button type="button" onClick={() => { setImportRows([]); setImportFileName(''); }}>Cancel</button></div>}<small>CSV columns: title, description, status, priority, dueAt, labels. Separate multiple labels with semicolons. Up to 200 tasks per import.</small></form>
        </div>
        {loading ? <p className="productivity-message">Loading tasks…</p> : (
          <div className="productivity-columns">{columns.map((column) => {
            const records = boardTasks.filter((task) => task.status === column.status);
            return <section className="productivity-column" key={column.status} aria-label={`${column.title}, ${records.length} tasks`}>
              <h3>{column.title}<span>{records.length}</span></h3>
              {records.length === 0 ? <p className="productivity-column__empty">Nothing here yet</p> : records.map((task) => <article className="productivity-task" key={task.id}>
                <label className="project-task-select"><input type="checkbox" checked={selectedTaskIds.includes(task.id)} onChange={(event) => { if (event.target.checked && selectedTaskIds.length >= 500) { setError('Bulk actions support up to 500 selected tasks.'); return; } setSelectedTaskIds((ids) => event.target.checked ? [...ids, task.id] : ids.filter((id) => id !== task.id)); }} /><span>Select task</span></label>
                <Link href={`/workspace/tasks/${task.id}`} className="productivity-task__title">{task.title}</Link>
                {task.project && <span className="productivity-task__project">{task.project.name}</span>}
                <TaskLabels labels={task.labels} taskTitle={task.title} disabled={busy} onSave={(labels) => void updateTask(task, 'labels', labels)} compact />
                <label className="productivity-task__assignee">Assignee<select aria-label={`Assignee for ${task.title}`} value={task.assignee?.id ?? ''} disabled={busy} onChange={(event) => void updateTask(task, 'assigneeId', event.target.value)}><option value="">Unassigned</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label>
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

function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function restoreCsvText(value: string) {
  return value.replace(/^'(?=[=+\-@\t\r])/, '');
}

function slug(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
}

function parseTaskCsv(source: string): TaskImportRow[] {
  const text = source.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ',') { row.push(cell); cell = ''; }
    else if (character === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (character !== '\r') cell += character;
  }
  if (quoted) throw new Error('This CSV has an unclosed quoted field.');
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const nonEmpty = rows.filter((current) => current.some((value) => value.trim()));
  if (nonEmpty.length < 2) throw new Error('The CSV needs a header row and at least one task.');
  const headers = nonEmpty[0].map((header) => header.trim().toLocaleLowerCase());
  const titleIndex = headers.indexOf('title');
  if (titleIndex < 0) throw new Error('The CSV is missing the required title column.');
  if (nonEmpty.length - 1 > 200) throw new Error('Import no more than 200 tasks at a time.');
  const valueAt = (values: string[], name: string) => { const index = headers.indexOf(name); return index < 0 ? '' : restoreCsvText(values[index]?.trim() ?? ''); };
  const statuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED'];
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  return nonEmpty.slice(1).map((values, index) => {
    const title = valueAt(values, 'title');
    const description = valueAt(values, 'description');
    const rawStatus = valueAt(values, 'status').toLocaleUpperCase() || 'TODO';
    const rawPriority = valueAt(values, 'priority').toLocaleUpperCase() || 'MEDIUM';
    const dueAt = valueAt(values, 'dueAt') || null;
    if (!title || title.length > 200) throw new Error(`Task on row ${index + 2} needs a title of 1–200 characters.`);
    if (description.length > 5000) throw new Error(`Description on row ${index + 2} is longer than 5,000 characters.`);
    if (!statuses.includes(rawStatus)) throw new Error(`Status on row ${index + 2} must be TODO, IN_PROGRESS, IN_REVIEW, COMPLETED, or CANCELLED.`);
    if (!priorities.includes(rawPriority)) throw new Error(`Priority on row ${index + 2} must be LOW, MEDIUM, HIGH, or URGENT.`);
    if (dueAt && !Number.isFinite(Date.parse(dueAt))) throw new Error(`Due date on row ${index + 2} is not a valid date.`);
    const labels = valueAt(values, 'labels').split(';').map((label) => label.trim().toLocaleLowerCase()).filter(Boolean);
    if (labels.length > 10 || labels.some((label) => label.length > 32 || !/^[\p{L}\p{N}_-]+$/u.test(label))) throw new Error(`Labels on row ${index + 2} must be up to 10 short words using letters, numbers, underscores, or hyphens.`);
    return { title, description: description || null, status: rawStatus, priority: rawPriority, dueAt, labels: [...new Set(labels)] };
  });
}
