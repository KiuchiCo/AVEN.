'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useT } from '../../i18n';
import { baseFor } from '../task-offline';
import { useTaskSync } from '../task-sync';
import { messageOf, useProjectApi, type Request } from './project-api';
import { importLegacyViews } from './legacy-views';
import { defaultFilters, type ActivityEntry, type Member, type Milestone, type Project, type SavedTaskView, type Task, type TaskViewFilters, type TeamMember } from './project-model';

export type TaskLayout = 'BOARD' | 'LIST' | 'CALENDAR';
export type TaskPreset = { status?: string; milestoneId?: string };
type SettingsDraft = Record<string, string>;
type LabelUsage = { label: string; taskCount: number };

/** Everything the six project tabs share. It lives in the layout, so changing tab keeps filters, selection and unsaved settings. */
type ProjectState = {
  project: Project; tasks: Task[]; milestones: Milestone[]; team: TeamMember[]; members: Member[]; activity: ActivityEntry[]; labels: LabelUsage[]; views: SavedTaskView[]; legacyViews: number;
  request: Request; busy: boolean; setBusy: (busy: boolean) => void;
  error: string; notice: string; fail: (reason: unknown, fallback: string) => void; say: (message: string) => void; clear: () => void;
  reload: () => Promise<void>; reloadTasks: () => Promise<void>; reloadMilestones: () => Promise<void>; reloadTeam: () => Promise<void>; reloadViews: () => Promise<void>;
  patchProject: (fields: Record<string, unknown>) => Promise<boolean>;
  saveTaskFields: (task: Task, fields: Record<string, unknown>) => Promise<void>;
  layout: TaskLayout; setLayout: (layout: TaskLayout) => void;
  filters: TaskViewFilters; setFilters: Dispatch<SetStateAction<TaskViewFilters>>;
  selected: string[]; setSelected: Dispatch<SetStateAction<string[]>>;
  settingsDraft: SettingsDraft | null; setSettingsDraft: (draft: SettingsDraft | null) => void;
  taskDialog: { task: Task | null; preset: TaskPreset } | null; openTask: (task: Task | null, preset?: TaskPreset) => void; closeTask: () => void;
};
const ProjectContext = createContext<ProjectState | null>(null);
export function useProject() {
  const value = useContext(ProjectContext);
  if (!value) throw new Error('useProject must be used inside a project workspace.');
  return value;
}

export type LoadState = 'loading' | 'ready' | 'missing' | 'failed';

/** Loads one project and the data every tab draws on. `children` receives the state only once the project exists. */
export function ProjectProvider({ projectId, children, fallback }: { projectId: string; children: ReactNode; fallback: (state: LoadState, message: string) => ReactNode }) {
  const t = useT();
  const { request, workspace } = useProjectApi();
  const sync = useTaskSync();
  const handledSync = useRef(0);
  const [state, setState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [labels, setLabels] = useState<LabelUsage[]>([]);
  const [views, setViews] = useState<SavedTaskView[]>([]);
  const [legacyViews, setLegacyViews] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [layout, setLayout] = useState<TaskLayout>('BOARD');
  const [filters, setFilters] = useState<TaskViewFilters>(() => defaultFilters(projectId));
  const [selected, setSelected] = useState<string[]>([]);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft | null>(null);
  const [taskDialog, setTaskDialog] = useState<ProjectState['taskDialog']>(null);

  const fail = useCallback((reason: unknown, fallbackText: string) => { setNotice(''); setError(messageOf(reason, fallbackText)); }, []);
  const say = useCallback((message: string) => { setError(''); setNotice(message); }, []);
  const clear = useCallback(() => { setError(''); setNotice(''); }, []);

  const reloadTasks = useCallback(async () => {
    const [taskRows, labelRows] = await Promise.all([request<Task[]>('/tasks'), request<LabelUsage[]>('/tasks/labels')]);
    setTasks(taskRows.filter((task) => task.project?.id === projectId)); setLabels(labelRows);
  }, [projectId, request]);
  const reloadMilestones = useCallback(async () => setMilestones(await request<Milestone[]>(`/projects/${projectId}/milestones`)), [projectId, request]);
  const reloadTeam = useCallback(async () => setTeam(await request<TeamMember[]>(`/projects/${projectId}/team`)), [projectId, request]);
  const reloadViews = useCallback(async () => { const result = await importLegacyViews(request, workspace.id, await request<SavedTaskView[]>('/tasks/views')); setViews(result.views); setLegacyViews(result.remaining); }, [request, workspace.id]);
  const reloadProject = useCallback(async () => setProject(await request<Project>(`/projects/${projectId}`)), [projectId, request]);
  const reloadActivity = useCallback(async () => {
    const rows = await request<ActivityEntry[]>('/activity');
    setActivity(rows);
  }, [request]);
  const reload = useCallback(async () => { await Promise.all([reloadProject(), reloadTasks(), reloadMilestones(), reloadTeam(), reloadActivity()]); }, [reloadActivity, reloadMilestones, reloadProject, reloadTasks, reloadTeam]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const found = await request<Project>(`/projects/${projectId}`);
        if (cancelled) return;
        setProject(found);
        const [, , , , memberRows] = await Promise.all([reloadTasks(), reloadMilestones(), reloadTeam(), reloadActivity().catch(() => undefined), request<Member[]>('/members').then((rows) => { if (!cancelled) setMembers(rows); return rows; }), reloadViews().catch(() => undefined)]);
        void memberRows;
        if (!cancelled) setState('ready');
      } catch (reason) {
        if (cancelled) return;
        const message = messageOf(reason, t('ph.unavailableBody'));
        setLoadError(message); setState(/not found/i.test(message) ? 'missing' : 'failed');
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, reloadActivity, reloadMilestones, reloadTasks, reloadTeam, reloadViews, request, t]);

  // Edits made offline reach the server later; when they do, show what is really saved.
  useEffect(() => {
    if (state !== 'ready' || sync.syncVersion === handledSync.current) return;
    handledSync.current = sync.syncVersion;
    void reloadTasks().catch(() => undefined);
  }, [reloadTasks, state, sync.syncVersion]);

  const patchProject = useCallback(async (fields: Record<string, unknown>) => {
    setBusy(true); clear();
    try { await request(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(fields) }); await Promise.all([reloadProject(), reloadActivity().catch(() => undefined)]); return true; }
    catch (reason) { fail(reason, 'Could not update the project.'); return false; }
    finally { setBusy(false); }
  }, [clear, fail, projectId, reloadActivity, reloadProject, request]);

  /** Saves a task edit, or keeps it on this device when offline and shows it as if it had saved. */
  const saveTaskFields = useCallback(async (task: Task, fields: Record<string, unknown>) => {
    const outcome = await sync.change(task.id, task.title, fields, baseFor(task, fields));
    if (outcome === 'saved') { await Promise.all([reloadTasks(), reloadMilestones()]); return; }
    const assignee = 'assigneeId' in fields ? members.find((member) => member.userId === fields.assigneeId) : undefined;
    const shown = { ...fields, ...('assigneeId' in fields ? { assignee: assignee ? { id: assignee.userId, displayName: assignee.displayName } : null } : {}) };
    setTasks((current) => current.map((row) => (row.id === task.id ? { ...row, ...shown } as Task : row)));
  }, [members, reloadMilestones, reloadTasks, sync]);

  const value = useMemo<ProjectState | null>(() => project && state === 'ready' ? {
    project, tasks, milestones, team, members, activity, labels, views, legacyViews, request, busy, setBusy, error, notice, fail, say, clear, reload, reloadTasks, reloadMilestones, reloadTeam, reloadViews, patchProject, saveTaskFields,
    layout, setLayout, filters, setFilters, selected, setSelected, settingsDraft, setSettingsDraft,
    taskDialog, openTask: (task, preset = {}) => setTaskDialog({ task, preset }), closeTask: () => setTaskDialog(null),
  } : null, [project, state, tasks, milestones, team, members, activity, labels, views, legacyViews, request, busy, error, notice, fail, say, clear, reload, reloadTasks, reloadMilestones, reloadTeam, reloadViews, patchProject, saveTaskFields, layout, filters, selected, settingsDraft, taskDialog]);

  if (!value) return <>{fallback(state, loadError)}</>;
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}
