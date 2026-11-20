'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/en';
import { useWorkspaceSession } from '../workspace-shell';
import { TaskLabels } from '../task-labels';
import { TaskBadges } from '../task-badges';
import { TemplateLibrary } from './templates/components/TemplateLibrary';
import { TemplateEditor } from './templates/components/editor/TemplateEditor';
import { templateDraft } from './templates/editor/normalize';
import type { ProjectTemplate, TemplateMilestone, TemplateTask } from './templates/types';
import { csvCell, parseTaskCsv, type TaskImportRow } from './task-csv';
import { baseFor } from '../task-offline';
import { useTaskSync } from '../task-sync';
import { EmptyState, PageHeader } from '../ui';
import { Icon, type IconName } from '../home-icons';

type Project = { id: string; name: string; description: string | null; status: string; dueAt: string | null; taskCount: number };
type Member = { userId: string; displayName: string; role: string };
type Task = { parent?: { id: string; title: string } | null; subtasks?: { id: string; status: string }[]; recurrence?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null; id: string; title: string; description: string | null; status: string; priority: string; labels: string[]; dueAt: string | null; project: { id: string; name: string } | null; assignee: { id: string; displayName: string } | null; dependsOn: { id: string; title: string; status: string }[]; blocks: { id: string; title: string; status: string }[] };
type Milestone = { id: string; title: string; dueAt: string | null; completedAt: string | null };
type TaskViewFilters = { projectId: string; search: string; status: string; priority: string; assigneeId: string; label: string; due: string; dependency: string; sort: string };
type SavedTaskView = { id: string; name: string; filters: TaskViewFilters; createdBy?: { id: string; displayName: string } };
type TaskLabelUsage = { label: string; taskCount: number };

const columnMeta: Record<string, { icon: IconName; art: 'stack' | 'search' | 'check' | 'folder'; empty: Key; text: Key }> = {
  TODO: { icon: 'list', art: 'stack', empty: 'pj.col.todoEmpty', text: 'pj.col.todoEmptyText' },
  IN_PROGRESS: { icon: 'refresh', art: 'stack', empty: 'pj.col.doingEmpty', text: 'pj.col.doingEmptyText' },
  IN_REVIEW: { icon: 'search', art: 'search', empty: 'pj.col.reviewEmpty', text: 'pj.col.reviewEmptyText' },
  COMPLETED: { icon: 'checkCircle', art: 'check', empty: 'pj.col.doneEmpty', text: 'pj.col.doneEmptyText' },
  CANCELLED: { icon: 'close', art: 'folder', empty: 'pj.col.cancelEmpty', text: 'pj.col.cancelEmptyText' },
};
const columns: { status: string; title: Key }[] = [
  { status: 'TODO', title: 'status.todo' },
  { status: 'IN_PROGRESS', title: 'status.inProgress' },
  { status: 'IN_REVIEW', title: 'status.inReview' },
  { status: 'COMPLETED', title: 'status.completed' },
  { status: 'CANCELLED', title: 'status.cancelled' },
];
const prioKeys: Record<string, Key> = { LOW: 'prio.low', MEDIUM: 'prio.medium', HIGH: 'prio.high', URGENT: 'prio.urgent' };
const capitalise = (value: string) => value.replace(/^./, (c) => c.toLocaleUpperCase());
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

export default function ProjectsPage() {
  const { getToken } = useAuth();
  const t = useT();
  const prio = (value: string) => capitalise(t(prioKeys[value] ?? 'prio.medium'));
  const { workspace } = useWorkspaceSession();
  const taskSync = useTaskSync();
  const handledSync = useRef(0);
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
  const [bulkStartMode, setBulkStartMode] = useState<'KEEP' | 'SET' | 'CLEAR'>('KEEP');
  const [bulkStartDate, setBulkStartDate] = useState('');
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
    if (!selectedProject) return;
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
    setSelectedTaskIds([]); setNotice(t('pj.applied', { name: view.name }));
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
      setTaskViewChoice(saved.id); setTaskViewName(saved.name); setNotice(t(selected ? 'pj.viewUpdated' : 'pj.viewSaved', { name: saved.name }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this task view.'); }
    finally { setBusy(false); }
  }

  async function deleteSavedTaskView() {
    if (!taskViewChoice) return;
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/tasks/views/${taskViewChoice}`, { method: 'DELETE' });
      setSavedTaskViews((views) => views.filter((view) => view.id !== taskViewChoice)); setTaskViewChoice(''); setTaskViewName('');
      setNotice(t('pj.viewDeleted'));
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
      await reload(); setNotice(t('pj.tplDuplicated', { name: template.name }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not duplicate this template.'); }
    finally { setBusy(false); }
  }

  async function importTemplate(template: Pick<ProjectTemplate, 'name' | 'description' | 'taskTemplates' | 'milestoneTemplates'>) {
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects/project-templates/import`, { method: 'POST', body: JSON.stringify(template) });
      await reload(); setNotice(t('pj.tplImported', { name: template.name }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import this template.'); throw reason; }
    finally { setBusy(false); }
  }

  async function createTemplate(template: Pick<ProjectTemplate, 'name' | 'description' | 'taskTemplates' | 'milestoneTemplates'>) {
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/projects/project-templates`, { method: 'POST', body: JSON.stringify(template) });
      await reload(); setNotice(t('pj.tplCreated', { name: template.name }));
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
      setNotice(t('pj.labelRenamed', { from: result.from, to: result.to, n: result.updated, merged: result.merged ? t('pj.labelMerged', { n: result.merged }) : '' }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not rename this label.'); }
    finally { setBusy(false); }
  }

  async function deleteWorkspaceTaskLabel(label: string) {
    if (!window.confirm(t('pj.removeLabelConfirm', { label }))) return;
    setBusy(true); setError('');
    try {
      const result = await request(`/workspaces/${workspace.id}/tasks/labels/${encodeURIComponent(label)}`, { method: 'DELETE' }) as { label: string; updated: number };
      if (labelFilter === result.label) setLabelFilter('');
      setSavedTaskViews((views) => views.map((view) => view.filters.label === result.label ? { ...view, filters: { ...view.filters, label: '' } } : view));
      if (renameLabelFrom === label) setRenameLabelFrom('');
      await reload(); setNotice(t('pj.labelRemoved', { label: result.label, n: result.updated }));
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

  /** Saves a task edit, or keeps it on this device when offline and shows it as if it had saved. */
  useEffect(() => {
    if (taskSync.syncVersion === handledSync.current) return;
    handledSync.current = taskSync.syncVersion;
    void reload().catch(() => undefined);
  }, [reload, taskSync.syncVersion]);

  async function saveTaskFields(task: Task, fields: Record<string, unknown>) {
    const outcome = await taskSync.change(task.id, task.title, fields, baseFor(task, fields));
    if (outcome === 'saved') { await reload(); return; }
    const assignee = 'assigneeId' in fields ? members.find((member) => member.userId === fields.assigneeId) : undefined;
    const shown = { ...fields, ...('assigneeId' in fields ? { assignee: assignee ? { id: assignee.userId, displayName: assignee.displayName } : null } : {}) };
    setTasks((current) => current.map((row) => (row.id === task.id ? { ...row, ...shown } as Task : row)));
  }

  async function changeStatus(task: Task, status: string) {
    setBusy(true); setError('');
    try {
      await saveTaskFields(task, { status });
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
      await saveTaskFields(task, { [field]: field === 'labels' ? value : value || null });
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
    if (bulkStartMode === 'SET') {
      if (!bulkStartDate) { setError('Choose a start date or select Clear start date.'); return; }
      changes.startAt = bulkStartDate;
    } else if (bulkStartMode === 'CLEAR') changes.startAt = null;
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
      setSelectedTaskIds([]); setBulkPriority(''); setBulkAssignee(''); setBulkStatus(''); setBulkDueMode('KEEP'); setBulkStartMode('KEEP'); setBulkStartDate(''); setBulkDueDate(''); setBulkLabelMode('KEEP'); setBulkLabels(''); await reload();
      setNotice(t('pj.bulkUpdated', { n: result.updated }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the selected tasks.'); }
    finally { setBusy(false); }
  }

  async function duplicateSelectedTasks() {
    if (!selectedTaskIds.length) return;
    if (selectedTaskIds.length > 100) { setError('Duplicate up to 100 tasks at a time.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request(`/workspaces/${workspace.id}/tasks/bulk/duplicate`, { method: 'POST', body: JSON.stringify({ taskIds: selectedTaskIds }) }) as { duplicated: number; checklistItemsCopied: number };
      setSelectedTaskIds([]); setBulkPriority(''); setBulkAssignee(''); setBulkStatus(''); setBulkDueMode('KEEP'); setBulkStartMode('KEEP'); setBulkStartDate(''); setBulkDueDate(''); setBulkLabelMode('KEEP'); setBulkLabels(''); await reload();
      setNotice(t('pj.bulkDuplicated', { n: result.duplicated, items: result.checklistItemsCopied }));
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
      setNotice(t('pj.csvDone', { created: result.created, updated: result.updated, unchanged: result.unchanged, project: selectedProjectName && result.created ? ` · ${selectedProjectName}` : '' }));
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
      <PageHeader eyebrow={t('act.eyebrow', { name: workspace.name })} title={t('nav.projects')} description={t('pj.desc')} icon="folder" />

      {error && <p className="productivity-error" role="alert">{error}</p>}
      {notice && <p className="productivity-success" role="status">{notice}</p>}

      <div className="productivity-forms">
        <form className="productivity-form" onSubmit={submitProject}>
          <h2><span className="rd-tile"><Icon name="folder" size={22} /></span>{t('pj.newProject')}</h2>
          <label>{t('pj.projectName')}<input name="name" maxLength={160} required placeholder={t('pj.projectNamePh')} /></label>
          <label>{t('db.description')} <span>{t('doc.optional')}</span><textarea name="description" maxLength={5000} rows={3} placeholder={t('pj.descPh')} /></label>
          <div className="productivity-form__row"><label>{t('pj.status')}<select name="status" defaultValue="PLANNING"><option value="PLANNING">{t('pj.s.planning')}</option><option value="IN_PROGRESS">{t('pj.s.inProgress')}</option><option value="ON_HOLD">{t('pj.s.onHold')}</option><option value="COMPLETED">{t('pj.s.completed')}</option></select></label><label>{t('pj.dueDate')} <span>{t('doc.optional')}</span><input name="dueAt" type="date" /></label></div>
          <label>{t('pj.budget')} <span>{t('pj.budgetHint')}</span><input name="budgetTotal" type="number" min="0" step="0.01" placeholder="25000.00" /></label>
          <button type="submit" disabled={busy}>{busy ? t('set.saving') : t('pj.createProject')}{!busy && <Icon name="arrow" size={16} />}</button>
        </form>
        <form className="productivity-form" onSubmit={submitTask}>
          <h2><span className="rd-tile"><Icon name="checkCircle" size={22} /></span>{t('pj.newTask')}</h2>
          <label>{t('pj.taskName')}<input name="title" maxLength={200} required placeholder={t('pj.taskNamePh')} /></label>
          <div className="productivity-form__row">
            <label>{t('kn.project')}<select name="projectId" value={selectedProject} onChange={(event) => { setSelectedProject(event.target.value); setSelectedTaskIds([]); }}><option value="">{t('doc.noProject')}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <label>{t('pj.priority')}<select name="priority" defaultValue="MEDIUM"><option value="LOW">{prio('LOW')}</option><option value="MEDIUM">{prio('MEDIUM')}</option><option value="HIGH">{prio('HIGH')}</option><option value="URGENT">{prio('URGENT')}</option></select></label>
          </div>
          <label>{t('pj.assignTo')} <span>{t('doc.optional')}</span><select name="assigneeId" defaultValue=""><option value="">{t('pj.unassigned')}</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label>
          <label>{t('pj.dueDate')} <span>{t('doc.optional')}</span><input name="dueAt" type="date" /></label>
          <button type="submit" disabled={busy}>{busy ? t('set.saving') : t('pj.createTask')}{!busy && <Icon name="arrow" size={16} />}</button>
        </form>
      </div>

      <section aria-labelledby="project-template-title">
        <p className="project-template-library__intro">{t('pj.tplIntro')}</p>
        {selectedProject ? <form className="project-template-save" onSubmit={saveSelectedTemplate}><label>{t('pj.saveTplAs', { name: selectedProjectName ?? '' })}<input name="templateName" required maxLength={160} placeholder={t('pj.tplNamePh')} /></label><button type="submit" disabled={busy}>{busy ? t('set.saving') : t('pj.saveTpl')}</button></form> : <p className="productivity-message">{t('pj.createFirst')}</p>}
        <TemplateLibrary workspaceId={workspace.id} templates={templates} favoritesReady={!loading && !error} busy={busy} selectedId={selectedTemplate} onEdit={editTemplate} onUse={(template) => { setSelectedTemplate(template.id); setNewProjectName(`${template.name} project`); }} onDuplicate={duplicateTemplate} onDelete={(template) => void deleteTemplate(template)} onImport={importTemplate} onCreate={createTemplate} />
        {selectedTemplate && <form className="project-template-launch" onSubmit={applyTemplate}><div><strong>{t('pj.startFrom', { name: templates.find((template) => template.id === selectedTemplate)?.name ?? '' })}</strong><span>{t('pj.startHint')}</span></div><label>{t('pj.newProjectName')}<input required maxLength={160} value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} /></label><button type="submit" disabled={busy}>{busy ? t('pj.creating') : t('pj.createProject')}</button><button type="button" onClick={() => setSelectedTemplate('')}>{t('msg.cancel')}</button></form>}
        {editingTemplateId && <TemplateEditor name={templateDraftName} description={templateDraftDescription} tasks={templateDraftTasks} milestones={templateDraftMilestones} busy={busy} onName={setTemplateDraftName} onDescription={setTemplateDraftDescription} onTasks={setTemplateDraftTasks} onMilestones={setTemplateDraftMilestones} onSubmit={saveTemplateEdits} onCancel={() => setEditingTemplateId('')} />}
      </section>

      <section className="productivity-projects" aria-labelledby="projects-list-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">{t('pj.saved')}</p><h2 id="projects-list-title">{t('pj.yours')}</h2></div><span>{t(projects.length === 1 ? 'pj.countOne' : 'pj.countMany', { n: projects.length })}</span></div>
        {loading ? <p className="productivity-message">{t('pj.loading')}</p> : projects.length === 0 ? (
          <p className="productivity-message">{t('pj.none')}</p>
        ) : (
          <div className="productivity-project-list">{projects.map((project) => (
            <article key={project.id} className={`productivity-project${selectedProject === project.id ? ' productivity-project--active' : ''}`}>
              <button className="productivity-project__select" onClick={() => { setSelectedProject(project.id); setSelectedTaskIds([]); }} aria-pressed={selectedProject === project.id}>
                <span><strong>{project.name}</strong><small>{project.description || t('pj.defaultDesc')}</small></span><span className="productivity-project__count">{t('pj.tasksCount', { n: project.taskCount })}</span>
              </button>
              <div className="productivity-project__controls"><label>{t('pj.status')} <select value={project.status} disabled={busy} onChange={(event) => void updateProject(project, 'status', event.target.value)}><option value="PLANNING">{t('pj.s.planning')}</option><option value="IN_PROGRESS">{t('pj.s.inProgress')}</option><option value="ON_HOLD">{t('pj.s.onHold')}</option><option value="COMPLETED">{t('pj.s.completed')}</option><option value="ARCHIVED">{t('pj.s.archived')}</option></select></label><label>{t('pj.due')} <input aria-label={t('pj.dueAria', { name: project.name })} type="date" value={project.dueAt?.slice(0, 10) ?? ''} disabled={busy} onChange={(event) => void updateProject(project, 'dueAt', event.target.value)} /></label></div>
              <Link className="productivity-project__open" href={`/workspace/projects/${project.id}`}>{t('pj.open')} <span aria-hidden="true">→</span></Link>
            </article>
          ))}</div>
        )}
      </section>

      {selectedProject && <section className="project-overview-panel" aria-labelledby="project-overview-title">
        <div className="workspace-section-heading"><div><p className="workspace-eyebrow">{t('pj.overview')}</p><h2 id="project-overview-title">{selectedProjectName}</h2></div><span>{t('pj.completeOf', { done: completedTasks, total: selectedProjectTasks.length })}</span></div>
        <div className="project-overview-progress"><div className="project-overview-progress__track"><span style={{ width: `${taskProgress}%` }} /></div><strong>{taskProgress}%</strong></div>
        <div className="project-milestones">
          <div className="project-milestones__heading"><h3>{t('pj.milestones')}</h3><span>{t('pj.msComplete', { done: milestones.filter((milestone) => milestone.completedAt).length, total: milestones.length })}</span></div>
          {milestones.length === 0 ? <p className="productivity-message">{t('pj.msNone')}</p> : <ul>{milestones.map((milestone) => <li key={milestone.id} className={milestone.completedAt ? 'project-milestone--complete' : ''}><label><input type="checkbox" checked={Boolean(milestone.completedAt)} disabled={busy} onChange={() => void toggleMilestone(milestone)} /><span>{milestone.title}</span></label><time>{milestone.dueAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(milestone.dueAt)) : t('pj.noDate')}</time></li>)}</ul>}
          <form className="project-milestone-form" onSubmit={submitMilestone}><label className="visually-hidden" htmlFor="milestone-title">{t('pj.msName')}</label><input id="milestone-title" name="title" maxLength={160} required placeholder={t('pj.msAddPh')} /><label className="visually-hidden" htmlFor="milestone-due">{t('pj.msDue')}</label><input id="milestone-due" name="dueAt" type="date" /><button type="submit" disabled={busy}>{busy ? t('set.saving') : t('pj.addMilestone')}</button></form>
        </div>
      </section>}

      <section className="project-workload-panel" aria-labelledby="project-workload-title">
        <div className="project-milestones__heading"><h2 id="project-workload-title">{t('pj.workload')}</h2><span>{t('pj.openTasks', { n: tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED').length })}</span></div>
        {members.length === 0 ? <p className="productivity-message">{t('pj.membersEmpty')}</p> : <div className="project-workload-list">{members.map((member) => {
          const openCount = tasks.filter((task) => task.assignee?.id === member.userId && task.status !== 'COMPLETED' && task.status !== 'CANCELLED').length;
          const totalOpen = tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED').length;
          return <div className="project-workload-row" key={member.userId}><span className="project-workload-row__name"><strong>{member.displayName}</strong><small>{({ OWNER: t('role.owner'), ADMINISTRATOR: t('role.administrator'), MANAGER: t('role.manager'), MEMBER: t('role.member'), GUEST: t('role.guest') } as Record<string, string>)[member.role] ?? member.role.toLowerCase()}</small></span><span className="project-workload-row__track"><span style={{ width: `${totalOpen ? Math.max((openCount / totalOpen) * 100, openCount ? 5 : 0) : 0}%` }} /></span><strong>{openCount}</strong></div>;
        })}<p className="project-workload-unassigned">{t('pj.unassignedCount', { n: tasks.filter((task) => !task.assignee && task.status !== 'COMPLETED' && task.status !== 'CANCELLED').length })}</p></div>}
      </section>

      <section className="productivity-board" aria-labelledby="task-board-title">
        <header className="board-head"><div><p className="workspace-eyebrow">{selectedProjectName ? t('pj.projectEyebrow', { name: selectedProjectName }) : t('pj.wsTasks')}</p><h2 id="task-board-title">{t('pj.board')}</h2><p className="rd-muted">{t('pj.boardDesc')}</p></div>
          <div className="board-head__actions">
            <label className="rd-btn rd-btn--soft"><Icon name="download" size={18} />{t('pj.importBtn')}<input type="file" hidden accept=".csv,text/csv" onChange={(event) => void readTaskCsv(event)} /></label>
            <button type="button" className="rd-btn rd-btn--soft" onClick={exportTasksCsv} disabled={!boardTasks.length}><Icon name="upload" size={18} />{t('pj.exportCsv')}</button>
            <details className="rd-menu"><summary className="rd-btn rd-btn--soft"><Icon name="sliders" size={18} />{t('pj.bulkActions')}<Icon name="chevron" size={14} /></summary><div className="rd-menu__list">
              <button type="button" onClick={() => { setSelectedTaskIds(boardTasks.slice(0, 500).map((task) => task.id)); if (boardTasks.length > 500) setNotice(t('pj.selectedFirst500')); }}><Icon name="checkCircle" size={16} />{t('pj.selectVisible')}</button>
              <button type="button" disabled={!selectedTaskIds.length} onClick={() => setSelectedTaskIds([])}><Icon name="close" size={16} />{t('pj.clearSelection')}</button></div></details>
          </div></header>
        <div className="task-view-tools" aria-label={t('pj.filtersAria')}>
          <label>{t('pj.search')}<input type="search" value={taskSearch} onChange={(event) => { setTaskSearch(event.target.value); setSelectedTaskIds([]); }} placeholder={t('pj.searchTasksPh')} /></label>
          <label>{t('pj.status')}<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setSelectedTaskIds([]); }}><option value="ALL">{t('pj.allStatuses')}</option>{columns.map((column) => <option key={column.status} value={column.status}>{t(column.title)}</option>)}</select></label>
          <label>{t('pj.priority')}<select value={priorityFilter} onChange={(event) => { setPriorityFilter(event.target.value); setSelectedTaskIds([]); }}><option value="ALL">{t('pj.allPriorities')}</option><option value="LOW">{prio('LOW')}</option><option value="MEDIUM">{prio('MEDIUM')}</option><option value="HIGH">{prio('HIGH')}</option><option value="URGENT">{prio('URGENT')}</option></select></label>
          <label>{t('pj.assignee')}<select value={assigneeFilter} onChange={(event) => { setAssigneeFilter(event.target.value); setSelectedTaskIds([]); }}><option value="ALL">{t('pj.anyone')}</option><option value="UNASSIGNED">{t('pj.unassigned')}</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label>
          <label>{t('lf.label')}<select value={labelFilter} onChange={(event) => { setLabelFilter(event.target.value); setSelectedTaskIds([]); }}><option value="">{t('lf.all')}</option>{[...new Set(tasks.flatMap((task) => task.labels))].sort().map((label) => <option key={label} value={label}>#{label}</option>)}</select></label>
          <label>{t('pj.dueDate')}<select value={dueFilter} onChange={(event) => { setDueFilter(event.target.value); setSelectedTaskIds([]); }}><option value="ALL">{t('pj.anyDate')}</option><option value="OVERDUE">{t('pj.overdue')}</option><option value="TODAY">{t('pj.dueToday')}</option><option value="NEXT_7_DAYS">{t('pj.next7')}</option><option value="NO_DATE">{t('pj.noDueDate')}</option></select></label>
          <label>{t('pj.sort')}<select value={taskSort} onChange={(event) => setTaskSort(event.target.value)}><option value="DUE_ASC">{t('pj.so.dueAsc')}</option><option value="DUE_DESC">{t('pj.so.dueDesc')}</option><option value="PRIORITY">{t('pj.so.priority')}</option><option value="TITLE">{t('pj.so.title')}</option></select></label>
          <label>{t('pj.dependency')}<select value={dependencyFilter} onChange={(event) => { setDependencyFilter(event.target.value); setSelectedTaskIds([]); }}><option value="ALL">{t('pj.d.any')}</option><option value="BLOCKED">{t('pj.d.blocked')}</option><option value="BLOCKING">{t('pj.d.blocking')}</option><option value="HAS_DEPENDENCIES">{t('pj.d.has')}</option><option value="NONE">{t('pj.d.none')}</option></select></label>
          <button type="button" onClick={() => { setTaskSearch(''); setStatusFilter('ALL'); setPriorityFilter('ALL'); setAssigneeFilter('ALL'); setLabelFilter(''); setDueFilter('ALL'); setDependencyFilter('ALL'); setTaskSort('DUE_ASC'); setSelectedTaskIds([]); }}>{t('pj.clearFilters')}</button>
          <form onSubmit={saveCurrentTaskView}><label>{taskViewChoice ? t('pj.updateSharedView') : t('pj.saveCurrentView')}<input required maxLength={60} value={taskViewName} onChange={(event) => setTaskViewName(event.target.value)} placeholder={t('pj.viewNamePh')} /></label><button type="submit" disabled={busy || (!taskViewChoice && savedTaskViews.length >= 20)}>{busy ? t('set.saving') : taskViewChoice ? t('pj.updateView') : t('pj.saveView')}</button></form>
          {savedTaskViews.length > 0 && <div className="task-view-tools__saved"><label>{t('pj.wsViews')}<select value={taskViewChoice} onChange={(event) => { setTaskViewChoice(event.target.value); setTaskViewName(savedTaskViews.find((view) => view.id === event.target.value)?.name ?? ''); }}><option value="">{t('pj.chooseView')}</option>{savedTaskViews.map((view) => <option key={view.id} value={view.id}>{view.name}{view.createdBy?.displayName ? ` · ${view.createdBy.displayName}` : ''}</option>)}</select></label><button type="button" disabled={!taskViewChoice || busy} onClick={() => { const view = savedTaskViews.find((item) => item.id === taskViewChoice); if (view) applyTaskView(view); }}>{t('pj.applyView')}</button><button type="button" disabled={!taskViewChoice || busy} onClick={() => void deleteSavedTaskView()}>{t('pj.deleteView')}</button><button type="button" disabled={busy} onClick={() => { setTaskViewChoice(''); setTaskViewName(''); }}>{t('pj.newView')}</button></div>}
          <p>{t('pj.sharedCount', { n: savedTaskViews.length })}</p>
          {legacyViewsRemaining > 0 && <p role="status">{t('pj.legacy', { n: legacyViewsRemaining })}</p>}
        </div>
        <details className="task-label-manager">
          <summary>{t('pj.wsLabels')} <span>{t('pj.labelsSummary', { n: taskLabelUsages.length })}</span></summary>
          <form onSubmit={renameWorkspaceTaskLabel}>
            <label>{t('pj.renameMerge')}<select required value={renameLabelFrom} onChange={(event) => setRenameLabelFrom(event.target.value)}><option value="">{t('pj.chooseLabel')}</option>{taskLabelUsages.map((item) => <option key={item.label} value={item.label}>{t('pj.labelUsage', { label: item.label, n: item.taskCount })}</option>)}</select></label>
            <label>{t('pj.newLabelName')}<input required maxLength={32} pattern="[\p{L}\p{N}_-]+" value={renameLabelTo} onChange={(event) => setRenameLabelTo(event.target.value)} placeholder={t('pj.newLabelPh')} /></label>
            <button type="submit" disabled={busy || !renameLabelFrom || !renameLabelTo.trim()}>{busy ? t('set.saving') : t('pj.renameMergeBtn')}</button>
          </form>
          {taskLabelUsages.length === 0 ? <p>{t('pj.noLabels')}</p> : <ul>{taskLabelUsages.map((item) => <li key={item.label}><span><strong>#{item.label}</strong><small>{t(item.taskCount === 1 ? 'pj.taskOne' : 'pj.taskMany', { n: item.taskCount })}</small></span><button type="button" disabled={busy} onClick={() => { setRenameLabelFrom(item.label); setRenameLabelTo(''); document.querySelector('.task-label-manager form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>{t('pj.rename')}</button><button type="button" disabled={busy} onClick={() => void deleteWorkspaceTaskLabel(item.label)}>{t('pj.removeEverywhere')}</button></li>)}</ul>}
          <p>{t('pj.labelsHint')}</p>
        </details>
        <div className="project-task-tools"><div className="project-task-tools__top"><span>{t('pj.inView', { n: boardTasks.length })}</span></div>
          {selectedTaskIds.length > 0 && <form className="project-task-bulk" onSubmit={bulkUpdateSelectedTasks}><strong>{t('pj.selectedN', { n: selectedTaskIds.length })}</strong><label>{t('pj.status')}<select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}><option value="">{t('pj.keepCurrent')}</option>{columns.map((column) => <option key={column.status} value={column.status}>{t(column.title)}</option>)}</select></label><label>{t('pj.priority')}<select value={bulkPriority} onChange={(event) => setBulkPriority(event.target.value)}><option value="">{t('pj.keepCurrent')}</option><option value="LOW">{prio('LOW')}</option><option value="MEDIUM">{prio('MEDIUM')}</option><option value="HIGH">{prio('HIGH')}</option><option value="URGENT">{prio('URGENT')}</option></select></label><label>{t('pj.assignTo')}<select value={bulkAssignee} onChange={(event) => setBulkAssignee(event.target.value)}><option value="">{t('pj.keepCurrent')}</option><option value="__clear__">{t('pj.unassign')}</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label><label>{t('pj.startDate')}<select value={bulkStartMode} onChange={(event) => setBulkStartMode(event.target.value as 'KEEP' | 'SET' | 'CLEAR')}><option value="KEEP">{t('pj.keepCurrent')}</option><option value="SET">{t('pj.setDate')}</option><option value="CLEAR">{t('pj.clearDate')}</option></select></label>{bulkStartMode === 'SET' && <label>{t('pj.newStartDate')}<input type="date" value={bulkStartDate} onChange={(event) => setBulkStartDate(event.target.value)} /></label>}<label>{t('pj.dueDate')}<select value={bulkDueMode} onChange={(event) => setBulkDueMode(event.target.value as 'KEEP' | 'SET' | 'CLEAR')}><option value="KEEP">{t('pj.keepCurrent')}</option><option value="SET">{t('pj.setDate')}</option><option value="CLEAR">{t('pj.clearDate')}</option></select></label>{bulkDueMode === 'SET' && <label>{t('pj.newDueDate')}<input type="date" value={bulkDueDate} onChange={(event) => setBulkDueDate(event.target.value)} /></label>}<label>{t('pj.labels')}<select value={bulkLabelMode} onChange={(event) => setBulkLabelMode(event.target.value as 'KEEP' | 'ADD' | 'REMOVE' | 'REPLACE')}><option value="KEEP">{t('pj.keepCurrent')}</option><option value="ADD">{t('pj.b.add')}</option><option value="REMOVE">{t('pj.b.remove')}</option><option value="REPLACE">{t('pj.b.replace')}</option></select></label>{bulkLabelMode !== 'KEEP' && <label>{t('pj.labelNames')}<input value={bulkLabels} onChange={(event) => setBulkLabels(event.target.value)} placeholder={t('pj.labelNamesPh')} maxLength={330} /></label>}{bulkLabelMode === 'REPLACE' && <small className="project-task-bulk__hint">{t('pj.bulkHint')}</small>}<button type="submit" disabled={busy}>{busy ? t('pj.updating') : t('pj.applyChanges')}</button><button type="button" className="project-task-bulk__duplicate" onClick={() => void duplicateSelectedTasks()} disabled={busy || selectedTaskIds.length > 100}>{busy ? t('pj.working') : t('pj.dupChecklists')}</button>{selectedTaskIds.length > 100 && <small>{t('pj.dupLimit')}</small>}</form>}
          <form className="project-task-import" onSubmit={importTasksCsv}>{importFileName && <div className="project-task-import__preview"><strong>{importFileName}</strong><span>{t('pj.rows', { n: importRows.length })} · {importMode === 'UPSERT' ? t('pj.importUpsert', { u: importRows.filter((task) => task.id).length, c: importRows.filter((task) => !task.id).length }) : (importRows.some((task) => task.projectId !== undefined) ? t('pj.importCsvValues') : selectedProjectName ? t('pj.importToProject', { name: selectedProjectName }) : t('pj.importToWs'))}</span><small>{importRows.slice(0, 3).map((task) => task.title).join(' · ')}{importRows.length > 3 ? ' …' : ''}</small><label>{t('pj.importBehavior')}<select value={importMode} onChange={(event) => setImportMode(event.target.value as 'CREATE' | 'UPSERT')}><option value="CREATE">{t('pj.importCreate')}</option><option value="UPSERT" disabled={!importRows.some((task) => task.id)}>{t('pj.importSync')}</option></select></label>{importMode === 'UPSERT' && <small>{t('pj.importSyncHint')}</small>}<button type="submit" disabled={busy || !importRows.length}>{busy ? t('pj.importing') : importMode === 'UPSERT' ? t('pj.syncCsv') : t('pj.importTasks')}</button><button type="button" onClick={() => { setImportRows([]); setImportFileName(''); setImportMode('CREATE'); }}>{t('msg.cancel')}</button></div>}<small>{t('pj.csvHint')}</small></form>
        </div>
        {loading ? <p className="productivity-message">{t('pj.loadingTasks')}</p> : (
          <div className="productivity-columns">{columns.map((column) => {
            const records = boardTasks.filter((task) => task.status === column.status);
            return <section className="productivity-column" key={column.status} aria-label={t('pj.columnAria', { title: t(column.title), n: records.length })}>
              <h3><span className="productivity-column__title"><Icon name={columnMeta[column.status].icon} size={20} />{t(column.title)}</span><span>{records.length}</span></h3>
              {records.length === 0 ? <div className="productivity-column__empty"><EmptyState art={columnMeta[column.status].art} compact title={t(columnMeta[column.status].empty)} text={t(columnMeta[column.status].text)} /></div> : records.map((task) => <article className="productivity-task" key={task.id}>
                <label className="project-task-select"><input type="checkbox" checked={selectedTaskIds.includes(task.id)} onChange={(event) => { if (event.target.checked && selectedTaskIds.length >= 500) { setError('Bulk actions support up to 500 selected tasks.'); return; } setSelectedTaskIds((ids) => event.target.checked ? [...ids, task.id] : ids.filter((id) => id !== task.id)); }} /><span>{t('pj.selectTask')}</span></label>
                <Link href={`/workspace/tasks/${task.id}`} className="productivity-task__title">{task.title}</Link><TaskBadges task={task} />
                {task.project && <span className="productivity-task__project">{task.project.name}</span>}
                {(task.dependsOn.some((item) => item.status !== 'COMPLETED') || task.blocks.some((item) => !['COMPLETED', 'CANCELLED'].includes(item.status))) && <div className="productivity-task__dependency-hints">{task.dependsOn.some((item) => item.status !== 'COMPLETED') && <span className="is-blocked">{t(task.dependsOn.filter((item) => item.status !== 'COMPLETED').length === 1 ? 'pj.blockedBy' : 'pj.blockedByMany', { n: task.dependsOn.filter((item) => item.status !== 'COMPLETED').length })}</span>}{task.blocks.some((item) => !['COMPLETED', 'CANCELLED'].includes(item.status)) && <span>{t(task.blocks.filter((item) => !['COMPLETED', 'CANCELLED'].includes(item.status)).length === 1 ? 'pj.blocksOne' : 'pj.blocksMany', { n: task.blocks.filter((item) => !['COMPLETED', 'CANCELLED'].includes(item.status)).length })}</span>}</div>}
                <TaskLabels labels={task.labels} taskTitle={task.title} disabled={busy} onSave={(labels) => void updateTask(task, 'labels', labels)} compact />
                <label className="productivity-task__assignee">{t('pj.assignee')}<select aria-label={t('pj.assigneeAria', { title: task.title })} value={task.assignee?.id ?? ''} disabled={busy} onChange={(event) => void updateTask(task, 'assigneeId', event.target.value)}><option value="">{t('pj.unassigned')}</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label>
                <div className="productivity-task__footer"><label className="visually-hidden" htmlFor={`priority-${task.id}`}>{t('pj.priorityFor', { title: task.title })}</label><select className={`productivity-priority productivity-priority--${task.priority.toLowerCase()}`} id={`priority-${task.id}`} value={task.priority} disabled={busy} onChange={(event) => void updateTask(task, 'priority', event.target.value)}><option value="LOW">{prio('LOW')}</option><option value="MEDIUM">{prio('MEDIUM')}</option><option value="HIGH">{prio('HIGH')}</option><option value="URGENT">{prio('URGENT')}</option></select><label className="visually-hidden" htmlFor={`status-${task.id}`}>{t('tasks.statusFor', { title: task.title })}</label><select id={`status-${task.id}`} value={task.status} disabled={busy} onChange={(event) => void changeStatus(task, event.target.value)}>{columns.map((option) => <option key={option.status} value={option.status}>{t(option.title)}</option>)}</select></div>
                <div className="productivity-task__due"><label htmlFor={`due-${task.id}`}>{t('pj.dueLabel')}</label><input id={`due-${task.id}`} type="date" value={task.dueAt?.slice(0, 10) ?? ''} disabled={busy} onChange={(event) => void updateTask(task, 'dueAt', event.target.value)} /><span className={task.dueAt && new Date(task.dueAt) < new Date(new Date().toDateString()) && task.status !== 'COMPLETED' ? 'productivity-task__overdue' : ''}>{task.dueAt && new Date(task.dueAt) < new Date(new Date().toDateString()) && task.status !== 'COMPLETED' ? t('pj.overdue') : ''}</span></div>
              </article>)}
              <button type="button" className="productivity-column__add" onClick={() => { const field = document.querySelector<HTMLInputElement>('.productivity-form input[name="title"]'); field?.scrollIntoView({ behavior: 'smooth', block: 'center' }); field?.focus(); }}><Icon name="plus" size={16} />{t('pj.addTask')}</button>
            </section>;
          })}</div>
        )}
      </section>
    </div>
  );
}

function slug(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
}
