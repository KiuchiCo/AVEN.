'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { TaskLabels } from '../task-labels';
import { TemplateLibrary } from './templates/components/TemplateLibrary';
import { TemplateEditor } from './templates/components/editor/TemplateEditor';
import { templateDraft } from './templates/editor/normalize';
import type { ProjectTemplate, TemplateMilestone, TemplateTask } from './templates/types';

type Project = { id: string; name: string; description: string | null; status: string; dueAt: string | null; taskCount: number };
type Member = { userId: string; displayName: string; role: string };
type Task = { id: string; title: string; description: string | null; status: string; priority: string; labels: string[]; dueAt: string | null; project: { id: string; name: string } | null; assignee: { id: string; displayName: string } | null; dependsOn: { id: string; title: string; status: string }[]; blocks: { id: string; title: string; status: string }[] };
type Milestone = { id: string; title: string; dueAt: string | null; completedAt: string | null };
type TaskImportRow = { id?: string | null; title: string; description: string | null; status: string; priority: string; dueAt: string | null; labels: string[]; projectId?: string | null; assigneeId?: string | null };
type TaskViewFilters = { projectId: string; search: string; status: string; priority: string; assigneeId: string; label: string; due: string; dependency: string; sort: string };
type SavedTaskView = { id: string; name: string; filters: TaskViewFilters; createdBy?: { id: string; displayName: string } };
type TaskLabelUsage = { label: string; taskCount: number };

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
  const [taskLabelUsages, setTaskLabelUsages] = useState<TaskLabelUsage[]>([]);
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
  const [taskSearch, setTaskSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState('ALL');
  const [labelFilter, setLabelFilter] = useState('');
  const [dueFilter, setDueFilter] = useState('ALL');
  const [dependencyFilter, setDependencyFilter] = useState('ALL');
  const [taskSort, setTaskSort] = useState('DUE_ASC');
  const [savedTaskViews, setSavedTaskViews] = useState<SavedTaskView[]>([]);
  const [legacyViewsRemaining, setLegacyViewsRemaining] = useState(0);
  const [taskViewName, setTaskViewName] = useState('');
  const [taskViewChoice, setTaskViewChoice] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [bulkPriority, setBulkPriority] = useState('');
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkDueMode, setBulkDueMode] = useState<'KEEP' | 'SET' | 'CLEAR'>('KEEP');
  const [bulkDueDate, setBulkDueDate] = useState('');
  const [bulkLabelMode, setBulkLabelMode] = useState<'KEEP' | 'ADD' | 'REMOVE' | 'REPLACE'>('KEEP');
  const [bulkLabels, setBulkLabels] = useState('');
  const [importRows, setImportRows] = useState<TaskImportRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importMode, setImportMode] = useState<'CREATE' | 'UPSERT'>('CREATE');
  const [renameLabelFrom, setRenameLabelFrom] = useState('');
  const [renameLabelTo, setRenameLabelTo] = useState('');

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
    const [projectRows, taskRows, memberRows, templateRows, labelRows, viewRows] = await Promise.all([
      request(`/workspaces/${workspace.id}/projects`),
      request(`/workspaces/${workspace.id}/tasks`),
      request(`/workspaces/${workspace.id}/members`),
      request(`/workspaces/${workspace.id}/projects/project-templates`),
      request(`/workspaces/${workspace.id}/tasks/labels`),
      request(`/workspaces/${workspace.id}/tasks/views`),
    ]) as [Project[], Task[], Member[], ProjectTemplate[], TaskLabelUsage[], SavedTaskView[]];
    setProjects(projectRows);
    setTasks(taskRows);
    setMembers(memberRows);
    setTemplates(templateRows);
    setTaskLabelUsages(labelRows);
    let availableViews = viewRows;
    const legacyKey = `aven.task-views.${workspace.id}`;
    const importedKey = `aven.task-views-imported.${workspace.id}`;
    try {
      const legacyRaw = localStorage.getItem(legacyKey);
      const legacyViews = legacyRaw ? JSON.parse(legacyRaw) as unknown : [];
      const importedRaw = localStorage.getItem(importedKey);
      const importedIds = new Set(importedRaw ? JSON.parse(importedRaw) as string[] : []);
      if (Array.isArray(legacyViews)) {
        let remaining = 0;
        for (const legacy of legacyViews) {
          if (!legacy || typeof legacy.id !== 'string' || typeof legacy.name !== 'string' || !legacy.filters || typeof legacy.filters !== 'object' || importedIds.has(legacy.id)) continue;
          if (availableViews.length >= 20) { remaining += 1; continue; }
          const baseName = legacy.name.trim().slice(0, 48) || 'Imported view';
          let name = baseName;
          let suffix = 2;
          while (availableViews.some((view) => view.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
            const tail = ` (local ${suffix++})`;
            name = `${baseName.slice(0, 60 - tail.length)}${tail}`;
          }
          try {
            const imported = await request(`/workspaces/${workspace.id}/tasks/views`, { method: 'POST', body: JSON.stringify({ name, filters: legacy.filters }) }) as SavedTaskView;
            availableViews = [imported, ...availableViews]; importedIds.add(legacy.id);
            localStorage.setItem(importedKey, JSON.stringify([...importedIds]));
          } catch { remaining += 1; }
        }
        setLegacyViewsRemaining(remaining);
        if (remaining === 0) { localStorage.removeItem(legacyKey); localStorage.removeItem(importedKey); }
      }
    } catch { setLegacyViewsRemaining(1); }
    setSavedTaskViews(availableViews);
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
  const boardTasks = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const nextWeek = new Date(now); nextWeek.setHours(0, 0, 0, 0); nextWeek.setDate(nextWeek.getDate() + 7);
    const week = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, '0')}-${String(nextWeek.getDate()).padStart(2, '0')}`;
    const filtered = tasks.filter((task) => {
      if (selectedProject && task.project?.id !== selectedProject) return false;
      if (priorityFilter !== 'ALL' && task.priority !== priorityFilter) return false;
      if (statusFilter !== 'ALL' && task.status !== statusFilter) return false;
      if (assigneeFilter === 'UNASSIGNED' ? Boolean(task.assignee) : assigneeFilter !== 'ALL' && task.assignee?.id !== assigneeFilter) return false;
      if (labelFilter && !task.labels.includes(labelFilter)) return false;
      if (taskSearch && !`${task.title} ${task.description ?? ''} ${task.project?.name ?? ''} ${task.labels.join(' ')}`.toLocaleLowerCase().includes(taskSearch.trim().toLocaleLowerCase())) return false;
      const due = task.dueAt?.slice(0, 10) ?? '';
      if (dueFilter === 'NO_DATE' && due) return false;
      if (dueFilter === 'OVERDUE' && (!due || due >= today || ['COMPLETED', 'CANCELLED'].includes(task.status))) return false;
      if (dueFilter === 'TODAY' && due !== today) return false;
      if (dueFilter === 'NEXT_7_DAYS' && (!due || due < today || due > week)) return false;
      const isBlocked = task.dependsOn.some((item) => item.status !== 'COMPLETED');
      const isBlocking = task.blocks.some((item) => !['COMPLETED', 'CANCELLED'].includes(item.status));
      if (dependencyFilter === 'BLOCKED' && !isBlocked) return false;
      if (dependencyFilter === 'BLOCKING' && !isBlocking) return false;
      if (dependencyFilter === 'HAS_DEPENDENCIES' && !task.dependsOn.length && !task.blocks.length) return false;
      if (dependencyFilter === 'NONE' && (task.dependsOn.length || task.blocks.length)) return false;
      return true;
    });
    const priorityRank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return filtered.sort((a, b) => taskSort === 'TITLE' ? a.title.localeCompare(b.title)
      : taskSort === 'PRIORITY' ? priorityRank[a.priority] - priorityRank[b.priority] || a.title.localeCompare(b.title)
        : taskSort === 'DUE_DESC' ? (b.dueAt ?? '').localeCompare(a.dueAt ?? '') || a.title.localeCompare(b.title)
          : (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.title.localeCompare(b.title));
  }, [tasks, selectedProject, priorityFilter, statusFilter, assigneeFilter, labelFilter, taskSearch, dueFilter, dependencyFilter, taskSort]);
  const completedTasks = selectedProjectTasks.filter((task) => task.status === 'COMPLETED').length;
  const taskProgress = selectedProjectTasks.length ? Math.round((completedTasks / selectedProjectTasks.length) * 100) : 0;

  function currentTaskViewFilters(): TaskViewFilters {
    return { projectId: selectedProject, search: taskSearch, status: statusFilter, priority: priorityFilter, assigneeId: assigneeFilter, label: labelFilter, due: dueFilter, dependency: dependencyFilter, sort: taskSort };
  }

  function applyTaskView(view: SavedTaskView) {
    const filters = view.filters;
    setSelectedProject(projects.some((project) => project.id === filters.projectId) ? filters.projectId : '');
    setTaskSearch(filters.search ?? ''); setStatusFilter(filters.status ?? 'ALL'); setPriorityFilter(filters.priority ?? 'ALL');
    setAssigneeFilter(filters.assigneeId ?? 'ALL'); setLabelFilter(filters.label ?? ''); setDueFilter(filters.due ?? 'ALL'); setDependencyFilter(filters.dependency ?? 'ALL'); setTaskSort(filters.sort ?? 'DUE_ASC');
    setSelectedTaskIds([]); setNotice(`Applied “${view.name}”.`);
  }

  async function saveCurrentTaskView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = taskViewName.trim();
    if (!name) return;
    const selected = savedTaskViews.find((view) => view.id === taskViewChoice);
    if (!selected && savedTaskViews.length >= 20) { setError('This workspace already has 20 saved task views.'); return; }
    setBusy(true); setError('');
    try {
      const saved = await request(selected ? `/workspaces/${workspace.id}/tasks/views/${selected.id}` : `/workspaces/${workspace.id}/tasks/views`, {
        method: selected ? 'PATCH' : 'POST', body: JSON.stringify({ name, filters: currentTaskViewFilters() }),
      }) as SavedTaskView;
      setSavedTaskViews((views) => selected ? views.map((view) => view.id === saved.id ? saved : view) : [saved, ...views]);
      setTaskViewChoice(saved.id); setTaskViewName(saved.name); setNotice(`${selected ? 'Updated' : 'Saved'} “${saved.name}” for this workspace.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this task view.'); }
    finally { setBusy(false); }
  }

  async function deleteSavedTaskView() {
    if (!taskViewChoice) return;
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/tasks/views/${taskViewChoice}`, { method: 'DELETE' });
      setSavedTaskViews((views) => views.filter((view) => view.id !== taskViewChoice)); setTaskViewChoice(''); setTaskViewName('');
      setNotice('Deleted the saved task view.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this task view.'); }
    finally { setBusy(false); }
  }

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

  async function duplicateTemplate(template: ProjectTemplate) {
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects/project-templates/${template.id}/duplicate`, { method: 'POST', body: JSON.stringify({}) });
      await reload(); setNotice(`Duplicated “${template.name}”.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not duplicate this template.'); }
    finally { setBusy(false); }
  }

  async function importTemplate(template: Pick<ProjectTemplate, 'name' | 'description' | 'taskTemplates' | 'milestoneTemplates'>) {
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects/project-templates/import`, { method: 'POST', body: JSON.stringify(template) });
      await reload(); setNotice(`Imported “${template.name}”.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import this template.'); throw reason; }
    finally { setBusy(false); }
  }

  async function createTemplate(template: Pick<ProjectTemplate, 'name' | 'description' | 'taskTemplates' | 'milestoneTemplates'>) {
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects/project-templates`, { method: 'POST', body: JSON.stringify(template) });
      await reload(); setNotice(`Created “${template.name}”.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create this template.'); throw reason; }
    finally { setBusy(false); }
  }

  async function renameWorkspaceTaskLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameLabelFrom || !renameLabelTo.trim()) return;
    setBusy(true); setError('');
    try {
      const result = await request(`/workspaces/${workspace.id}/tasks/labels`, { method: 'PATCH', body: JSON.stringify({ from: renameLabelFrom, to: renameLabelTo }) }) as { from: string; to: string; updated: number; merged: number };
      if (labelFilter === result.from) setLabelFilter(result.to);
      setSavedTaskViews((views) => views.map((view) => view.filters.label === result.from ? { ...view, filters: { ...view.filters, label: result.to } } : view));
      setRenameLabelFrom(''); setRenameLabelTo(''); await reload();
      setNotice(`Renamed #${result.from} to #${result.to} on ${result.updated} tasks${result.merged ? `; merged duplicates on ${result.merged}` : ''}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not rename this label.'); }
    finally { setBusy(false); }
  }

  async function deleteWorkspaceTaskLabel(label: string) {
    if (!window.confirm(`Remove #${label} from every task in this workspace? This cannot be undone.`)) return;
    setBusy(true); setError('');
    try {
      const result = await request(`/workspaces/${workspace.id}/tasks/labels/${encodeURIComponent(label)}`, { method: 'DELETE' }) as { label: string; updated: number };
      if (labelFilter === result.label) setLabelFilter('');
      setSavedTaskViews((views) => views.map((view) => view.filters.label === result.label ? { ...view, filters: { ...view.filters, label: '' } } : view));
      if (renameLabelFrom === label) setRenameLabelFrom('');
      await reload(); setNotice(`Removed #${result.label} from ${result.updated} tasks.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not remove this label.'); }
    finally { setBusy(false); }
  }

  function editTemplate(template: ProjectTemplate) {
    const draft = templateDraft(template);
    setEditingTemplateId(template.id); setTemplateDraftName(draft.name); setTemplateDraftDescription(draft.description);
    setTemplateDraftTasks(draft.tasks); setTemplateDraftMilestones(draft.milestones);
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
    if (bulkStatus) changes.status = bulkStatus;
    if (bulkDueMode === 'SET') {
      if (!bulkDueDate) { setError('Choose a date or select Clear due date.'); return; }
      changes.dueAt = bulkDueDate;
    } else if (bulkDueMode === 'CLEAR') changes.dueAt = null;
    if (bulkLabelMode !== 'KEEP') {
      const labels = [...new Set(bulkLabels.split(',').map((label) => label.trim().toLocaleLowerCase()).filter(Boolean))];
      if (bulkLabelMode !== 'REPLACE' && labels.length === 0) { setError('Enter one or more labels to add or remove.'); return; }
      if (labels.some((label) => label.length > 32 || !/^[\p{L}\p{N}_-]+$/u.test(label)) || labels.length > 10) { setError('Use up to 10 labels, each 1–32 letters, numbers, underscores, or hyphens.'); return; }
      if (bulkLabelMode === 'ADD') changes.addLabels = labels;
      else if (bulkLabelMode === 'REMOVE') changes.removeLabels = labels;
      else changes.labels = labels;
    }
    if (!Object.keys(changes).length) { setError('Choose at least one bulk change first.'); return; }
    setBusy(true); setError('');
    try {
      const result = await request(`/workspaces/${workspace.id}/tasks/bulk`, { method: 'PATCH', body: JSON.stringify({ taskIds: selectedTaskIds, ...changes }) }) as { updated: number };
      setSelectedTaskIds([]); setBulkPriority(''); setBulkAssignee(''); setBulkStatus(''); setBulkDueMode('KEEP'); setBulkDueDate(''); setBulkLabelMode('KEEP'); setBulkLabels(''); await reload();
      setNotice(`Updated ${result.updated} tasks.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the selected tasks.'); }
    finally { setBusy(false); }
  }

  async function duplicateSelectedTasks() {
    if (!selectedTaskIds.length) return;
    if (selectedTaskIds.length > 100) { setError('Duplicate up to 100 tasks at a time.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request(`/workspaces/${workspace.id}/tasks/bulk/duplicate`, { method: 'POST', body: JSON.stringify({ taskIds: selectedTaskIds }) }) as { duplicated: number; checklistItemsCopied: number };
      setSelectedTaskIds([]); setBulkPriority(''); setBulkAssignee(''); setBulkStatus(''); setBulkDueMode('KEEP'); setBulkDueDate(''); setBulkLabelMode('KEEP'); setBulkLabels(''); await reload();
      setNotice(`Duplicated ${result.duplicated} tasks and copied ${result.checklistItemsCopied} checklist items.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not duplicate the selected tasks.'); }
    finally { setBusy(false); }
  }

  function exportTasksCsv() {
    const header = ['id', 'title', 'description', 'status', 'priority', 'dueAt', 'projectId', 'assigneeId', 'labels'];
    const rows = boardTasks.map((task) => [task.id, task.title, task.description ?? '', task.status, task.priority, task.dueAt ?? '', task.project?.id ?? '', task.assignee?.id ?? '', task.labels.join(';')]);
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
      setImportRows(parsed); setImportFileName(file.name); setImportMode('CREATE');
    } catch (reason) { setImportRows([]); setImportFileName(''); setImportMode('CREATE'); setError(reason instanceof Error ? reason.message : 'Could not read this CSV file.'); }
  }

  async function importTasksCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importRows.length) return;
    const formElement = event.currentTarget;
    setBusy(true); setError('');
    try {
      const result = await request(`/workspaces/${workspace.id}/tasks/import`, { method: 'POST', body: JSON.stringify({ mode: importMode, projectId: selectedProject || null, tasks: importRows }) }) as { created: number; updated: number; unchanged: number };
      setImportRows([]); setImportFileName(''); setImportMode('CREATE'); formElement.reset(); await reload();
      setNotice(`CSV import finished: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged${selectedProjectName && result.created ? ` · ${selectedProjectName}` : ''}.`);
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

      <section aria-labelledby="project-template-title">
        <p className="project-template-library__intro">Save a project’s description, task dependencies, and milestones as a starter. Task and milestone due dates are stored as day offsets and recalculated for each new project; completion states and assignees start fresh.</p>
        {selectedProject ? <form className="project-template-save" onSubmit={saveSelectedTemplate}><label>Save “{selectedProjectName}” as a template<input name="templateName" required maxLength={160} placeholder="e.g. Website launch" /></label><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save template'}</button></form> : <p className="productivity-message">Create a project first, then save it here as a reusable template.</p>}
        <TemplateLibrary templates={templates} busy={busy} selectedId={selectedTemplate} onEdit={editTemplate} onUse={(template) => { setSelectedTemplate(template.id); setNewProjectName(`${template.name} project`); }} onDuplicate={duplicateTemplate} onDelete={(template) => void deleteTemplate(template)} onImport={importTemplate} onCreate={createTemplate} />
        {selectedTemplate && <form className="project-template-launch" onSubmit={applyTemplate}><div><strong>Start from {templates.find((template) => template.id === selectedTemplate)?.name}</strong><span>Creates fresh tasks and milestones with the template’s relative schedule.</span></div><label>New project name<input required maxLength={160} value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} /></label><button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create project'}</button><button type="button" onClick={() => setSelectedTemplate('')}>Cancel</button></form>}
        {editingTemplateId && <TemplateEditor name={templateDraftName} description={templateDraftDescription} tasks={templateDraftTasks} milestones={templateDraftMilestones} busy={busy} onName={setTemplateDraftName} onDescription={setTemplateDraftDescription} onTasks={setTemplateDraftTasks} onMilestones={setTemplateDraftMilestones} onSubmit={saveTemplateEdits} onCancel={() => setEditingTemplateId('')} />}
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
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">{selectedProjectName ? `PROJECT · ${selectedProjectName}` : 'WORKSPACE TASKS'}</p><h2 id="task-board-title">Task board</h2></div></div>
        <div className="task-view-tools" aria-label="Task view filters">
          <label>Search<input type="search" value={taskSearch} onChange={(event) => { setTaskSearch(event.target.value); setSelectedTaskIds([]); }} placeholder="Task, description, project, label" /></label>
          <label>Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setSelectedTaskIds([]); }}><option value="ALL">All statuses</option>{columns.map((column) => <option key={column.status} value={column.status}>{column.title}</option>)}</select></label>
          <label>Priority<select value={priorityFilter} onChange={(event) => { setPriorityFilter(event.target.value); setSelectedTaskIds([]); }}><option value="ALL">All priorities</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
          <label>Assignee<select value={assigneeFilter} onChange={(event) => { setAssigneeFilter(event.target.value); setSelectedTaskIds([]); }}><option value="ALL">Anyone</option><option value="UNASSIGNED">Unassigned</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label>
          <label>Label<select value={labelFilter} onChange={(event) => { setLabelFilter(event.target.value); setSelectedTaskIds([]); }}><option value="">All labels</option>{[...new Set(tasks.flatMap((task) => task.labels))].sort().map((label) => <option key={label} value={label}>#{label}</option>)}</select></label>
          <label>Due date<select value={dueFilter} onChange={(event) => { setDueFilter(event.target.value); setSelectedTaskIds([]); }}><option value="ALL">Any date</option><option value="OVERDUE">Overdue</option><option value="TODAY">Due today</option><option value="NEXT_7_DAYS">Next 7 days</option><option value="NO_DATE">No due date</option></select></label>
          <label>Sort<select value={taskSort} onChange={(event) => setTaskSort(event.target.value)}><option value="DUE_ASC">Due date · earliest</option><option value="DUE_DESC">Due date · latest</option><option value="PRIORITY">Priority · highest</option><option value="TITLE">Title · A–Z</option></select></label>
          <label>Dependency<select value={dependencyFilter} onChange={(event) => { setDependencyFilter(event.target.value); setSelectedTaskIds([]); }}><option value="ALL">Any dependency state</option><option value="BLOCKED">Blocked by unfinished prerequisites</option><option value="BLOCKING">Blocking other open tasks</option><option value="HAS_DEPENDENCIES">Has dependencies</option><option value="NONE">No dependencies</option></select></label>
          <button type="button" onClick={() => { setTaskSearch(''); setStatusFilter('ALL'); setPriorityFilter('ALL'); setAssigneeFilter('ALL'); setLabelFilter(''); setDueFilter('ALL'); setDependencyFilter('ALL'); setTaskSort('DUE_ASC'); setSelectedTaskIds([]); }}>Clear filters</button>
          <form onSubmit={saveCurrentTaskView}><label>{taskViewChoice ? 'Update shared view' : 'Save current view'}<input required maxLength={60} value={taskViewName} onChange={(event) => setTaskViewName(event.target.value)} placeholder="e.g. My overdue work" /></label><button type="submit" disabled={busy || (!taskViewChoice && savedTaskViews.length >= 20)}>{busy ? 'Saving…' : taskViewChoice ? 'Update view' : 'Save view'}</button></form>
          {savedTaskViews.length > 0 && <div className="task-view-tools__saved"><label>Workspace views<select value={taskViewChoice} onChange={(event) => { setTaskViewChoice(event.target.value); setTaskViewName(savedTaskViews.find((view) => view.id === event.target.value)?.name ?? ''); }}><option value="">Choose a saved view</option>{savedTaskViews.map((view) => <option key={view.id} value={view.id}>{view.name}{view.createdBy?.displayName ? ` · ${view.createdBy.displayName}` : ''}</option>)}</select></label><button type="button" disabled={!taskViewChoice || busy} onClick={() => { const view = savedTaskViews.find((item) => item.id === taskViewChoice); if (view) applyTaskView(view); }}>Apply view</button><button type="button" disabled={!taskViewChoice || busy} onClick={() => void deleteSavedTaskView()}>Delete view</button><button type="button" disabled={busy} onClick={() => { setTaskViewChoice(''); setTaskViewName(''); }}>New view</button></div>}
          <p>{savedTaskViews.length} / 20 shared views. Everyone in this workspace can apply or update them.</p>
          {legacyViewsRemaining > 0 && <p role="status">{legacyViewsRemaining} older browser-saved view(s) are still on this device. Free a workspace view slot and reload to finish importing them.</p>}
        </div>
        <details className="task-label-manager">
          <summary>Workspace labels <span>{taskLabelUsages.length} labels · manage names and usage</span></summary>
          <form onSubmit={renameWorkspaceTaskLabel}>
            <label>Rename or merge<select required value={renameLabelFrom} onChange={(event) => setRenameLabelFrom(event.target.value)}><option value="">Choose a label</option>{taskLabelUsages.map((item) => <option key={item.label} value={item.label}>#{item.label} · {item.taskCount} tasks</option>)}</select></label>
            <label>New label name<input required maxLength={32} pattern="[\p{L}\p{N}_-]+" value={renameLabelTo} onChange={(event) => setRenameLabelTo(event.target.value)} placeholder="new-label" /></label>
            <button type="submit" disabled={busy || !renameLabelFrom || !renameLabelTo.trim()}>{busy ? 'Saving…' : 'Rename / merge'}</button>
          </form>
          {taskLabelUsages.length === 0 ? <p>No labels yet. Add labels from any task card or import.</p> : <ul>{taskLabelUsages.map((item) => <li key={item.label}><span><strong>#{item.label}</strong><small>{item.taskCount} {item.taskCount === 1 ? 'task' : 'tasks'}</small></span><button type="button" disabled={busy} onClick={() => { setRenameLabelFrom(item.label); setRenameLabelTo(''); document.querySelector('.task-label-manager form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>Rename</button><button type="button" disabled={busy} onClick={() => void deleteWorkspaceTaskLabel(item.label)}>Remove everywhere</button></li>)}</ul>}
          <p>Renaming to an existing label merges the two names. Changes are recorded on each affected task and notify its followers.</p>
        </details>
        <div className="project-task-tools"><div className="project-task-tools__top"><span>{boardTasks.length} tasks in this view</span><div><button type="button" onClick={() => { setSelectedTaskIds(boardTasks.slice(0, 500).map((task) => task.id)); if (boardTasks.length > 500) setNotice('Selected the first 500 visible tasks; narrow the view to select a different batch.'); }}>Select visible (up to 500)</button><button type="button" disabled={!selectedTaskIds.length} onClick={() => setSelectedTaskIds([])}>Clear selection</button><button type="button" onClick={exportTasksCsv} disabled={!boardTasks.length}>Export CSV</button></div></div>
          {selectedTaskIds.length > 0 && <form className="project-task-bulk" onSubmit={bulkUpdateSelectedTasks}><strong>{selectedTaskIds.length} selected</strong><label>Status<select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}><option value="">Keep current</option>{columns.map((column) => <option key={column.status} value={column.status}>{column.title}</option>)}</select></label><label>Priority<select value={bulkPriority} onChange={(event) => setBulkPriority(event.target.value)}><option value="">Keep current</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label><label>Assign to<select value={bulkAssignee} onChange={(event) => setBulkAssignee(event.target.value)}><option value="">Keep current</option><option value="__clear__">Unassign</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label><label>Due date<select value={bulkDueMode} onChange={(event) => setBulkDueMode(event.target.value as 'KEEP' | 'SET' | 'CLEAR')}><option value="KEEP">Keep current</option><option value="SET">Set date</option><option value="CLEAR">Clear date</option></select></label>{bulkDueMode === 'SET' && <label>New due date<input type="date" value={bulkDueDate} onChange={(event) => setBulkDueDate(event.target.value)} /></label>}<label>Labels<select value={bulkLabelMode} onChange={(event) => setBulkLabelMode(event.target.value as 'KEEP' | 'ADD' | 'REMOVE' | 'REPLACE')}><option value="KEEP">Keep current</option><option value="ADD">Add labels</option><option value="REMOVE">Remove labels</option><option value="REPLACE">Replace labels</option></select></label>{bulkLabelMode !== 'KEEP' && <label>Label names<input value={bulkLabels} onChange={(event) => setBulkLabels(event.target.value)} placeholder="planning, launch" maxLength={330} /></label>}{bulkLabelMode === 'REPLACE' && <small className="project-task-bulk__hint">Leave empty to remove every label from the selection.</small>}<button type="submit" disabled={busy}>{busy ? 'Updating…' : 'Apply changes'}</button><button type="button" className="project-task-bulk__duplicate" onClick={() => void duplicateSelectedTasks()} disabled={busy || selectedTaskIds.length > 100}>{busy ? 'Working…' : 'Duplicate with checklists'}</button>{selectedTaskIds.length > 100 && <small>Choose 100 or fewer tasks to duplicate them.</small>}</form>}
          <form className="project-task-import" onSubmit={importTasksCsv}><label>Import task CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void readTaskCsv(event)} /></label>{importFileName && <div className="project-task-import__preview"><strong>{importFileName}</strong><span>{importRows.length} rows · {importMode === 'UPSERT' ? `${importRows.filter((task) => task.id).length} matching IDs update, ${importRows.filter((task) => !task.id).length} new tasks create` : `${importRows.some((task) => task.projectId !== undefined) ? 'new tasks will use the project and assignee values in the CSV' : selectedProjectName ? `new tasks will be added to ${selectedProjectName}` : 'new tasks will be added to the workspace'}`}</span><small>{importRows.slice(0, 3).map((task) => task.title).join(' · ')}{importRows.length > 3 ? ' …' : ''}</small><label>Import behavior<select value={importMode} onChange={(event) => setImportMode(event.target.value as 'CREATE' | 'UPSERT')}><option value="CREATE">Create new tasks</option><option value="UPSERT" disabled={!importRows.some((task) => task.id)}>Update matching task IDs and create new rows</option></select></label>{importMode === 'UPSERT' && <small>Rows with IDs update tasks in this workspace. Rows without IDs create tasks. AVEN checks project and assignee IDs before saving.</small>}<button type="submit" disabled={busy || !importRows.length}>{busy ? 'Importing…' : importMode === 'UPSERT' ? 'Sync CSV changes' : 'Import tasks'}</button><button type="button" onClick={() => { setImportRows([]); setImportFileName(''); setImportMode('CREATE'); }}>Cancel</button></div>}<small>CSV columns: title, description, status, priority, dueAt, labels. AVEN exports also include task, project, and assignee IDs for round-trip updates. Separate multiple labels with semicolons. Up to 200 rows per import.</small></form>
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
                {(task.dependsOn.some((item) => item.status !== 'COMPLETED') || task.blocks.some((item) => !['COMPLETED', 'CANCELLED'].includes(item.status))) && <div className="productivity-task__dependency-hints">{task.dependsOn.some((item) => item.status !== 'COMPLETED') && <span className="is-blocked">Blocked by {task.dependsOn.filter((item) => item.status !== 'COMPLETED').length} prerequisite{task.dependsOn.filter((item) => item.status !== 'COMPLETED').length === 1 ? '' : 's'}</span>}{task.blocks.some((item) => !['COMPLETED', 'CANCELLED'].includes(item.status)) && <span>Blocks {task.blocks.filter((item) => !['COMPLETED', 'CANCELLED'].includes(item.status)).length} open task{task.blocks.filter((item) => !['COMPLETED', 'CANCELLED'].includes(item.status)).length === 1 ? '' : 's'}</span>}</div>}
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
  if (new Set(headers).size !== headers.length) throw new Error('The CSV contains duplicate column names.');
  const hasIdColumn = headers.includes('id');
  if (hasIdColumn) {
    const requiredRoundTripColumns = ['id', 'title', 'description', 'status', 'priority', 'dueat', 'projectid', 'assigneeid', 'labels'];
    const missingColumns = requiredRoundTripColumns.filter((header) => !headers.includes(header));
    if (missingColumns.length) throw new Error(`AVEN task sync requires all export columns. Missing: ${missingColumns.join(', ')}.`);
  }
  if (nonEmpty.length - 1 > 200) throw new Error('Import no more than 200 tasks at a time.');
  const valueAt = (values: string[], name: string) => { const index = headers.indexOf(name); return index < 0 ? '' : restoreCsvText(values[index]?.trim() ?? ''); };
  const statuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED'];
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  const seenIds = new Set<string>();
  return nonEmpty.slice(1).map((values, index) => {
    if (values.length > headers.length) throw new Error(`Row ${index + 2} has more values than the header row.`);
    const id = valueAt(values, 'id') || null;
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error(`Task ID on row ${index + 2} is not a valid UUID.`);
    if (id && seenIds.has(id.toLocaleLowerCase())) throw new Error(`Task ID on row ${index + 2} appears more than once.`);
    if (id) seenIds.add(id.toLocaleLowerCase());
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
    const result: TaskImportRow = { id, title, description: description || null, status: rawStatus, priority: rawPriority, dueAt, labels: [...new Set(labels)] };
    if (headers.includes('projectid')) result.projectId = valueAt(values, 'projectid') || null;
    if (headers.includes('assigneeid')) result.assigneeId = valueAt(values, 'assigneeid') || null;
    return result;
  });
}
