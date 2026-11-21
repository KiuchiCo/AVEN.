/** Types and pure rules for the Projects module. Nothing here touches the network or React, so it is easy to test. */

export type ProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';
export type Person = { id: string; displayName: string };
export type Project = {
  id: string; name: string; description: string | null; status: ProjectStatus; startAt: string | null; dueAt: string | null; visibility: 'WORKSPACE' | 'TEAM';
  budgetTotalCents: number | null; budgetSpentCents: number; ownerId: string | null; owner: Person; createdAt: string; updatedAt: string;
  taskCount: number; completedCount: number; canAdminister?: boolean;
};
export type Member = { userId: string; displayName: string; role: string };
export type TeamMember = Member & { isOwner: boolean };
export type TaskRef = { id: string; title: string; status: string };
export type Task = {
  id: string; title: string; description: string | null; status: string; priority: string; labels: string[]; startAt: string | null; dueAt: string | null;
  project: { id: string; name: string } | null; milestone?: { id: string; title: string } | null; assignee: Person | null;
  dependsOn: TaskRef[]; blocks: TaskRef[]; parent?: { id: string; title: string } | null; subtasks?: { id: string; status: string }[]; recurrence?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null; events?: { id: string }[];
};
export type Milestone = {
  id: string; title: string; description: string | null; dueAt: string | null; completedAt: string | null;
  tasks: { id: string; title: string; status: string; dueAt: string | null }[]; taskCount: number; completedCount: number;
};
export type ActivityEntry = { id: string; entityType: string; entityId: string; message: string; createdAt: string; actor: { displayName: string } };
export type TaskViewFilters = { projectId: string; search: string; status: string; priority: string; assigneeId: string; label: string; due: string; dependency: string; sort: string };
export type SavedTaskView = { id: string; name: string; filters: TaskViewFilters; createdBy?: Person };

export const taskStatuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED'] as const;
export const taskPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const projectStatuses = ['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as const;
const closed = new Set(['COMPLETED', 'CANCELLED']);
export const isOpen = (task: { status: string }) => !closed.has(task.status);

/** A calendar day as YYYY-MM-DD in the viewer's own time zone. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export const addDays = (date: Date, days: number) => { const next = new Date(date); next.setHours(0, 0, 0, 0); next.setDate(next.getDate() + days); return next; };
export const dateOnly = (value: string | null | undefined) => value?.slice(0, 10) ?? '';

/** Whole-project percentage: finished tasks over tasks that are not cancelled. */
export function percent(done: number, total: number): number {
  return total > 0 ? Math.round((Math.min(done, total) / total) * 100) : 0;
}
export function taskStats(tasks: Task[], now = new Date()) {
  const today = dayKey(now);
  const planned = tasks.filter((task) => task.status !== 'CANCELLED');
  const completed = planned.filter((task) => task.status === 'COMPLETED').length;
  const open = tasks.filter(isOpen);
  return {
    total: tasks.length, planned: planned.length, completed, inProgress: tasks.filter((task) => task.status === 'IN_PROGRESS' || task.status === 'IN_REVIEW').length,
    open: open.length, overdue: open.filter((task) => task.dueAt && dateOnly(task.dueAt) < today).length, unassigned: open.filter((task) => !task.assignee).length,
    progress: percent(completed, planned.length),
  };
}

const rank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
export const defaultFilters = (projectId = ''): TaskViewFilters => ({ projectId, search: '', status: 'ALL', priority: 'ALL', assigneeId: 'ALL', label: '', due: 'ALL', dependency: 'ALL', sort: 'DUE_ASC' });
export const filtersAreDefault = (filters: TaskViewFilters) => JSON.stringify({ ...filters, projectId: '' }) === JSON.stringify(defaultFilters());

/** The same filters and sorting the saved task views have always used, applied to one project's tasks. */
export function filterTasks(tasks: Task[], filters: TaskViewFilters, now = new Date()): Task[] {
  const today = dayKey(now);
  const week = dayKey(addDays(now, 7));
  const query = filters.search.trim().toLocaleLowerCase();
  const rows = tasks.filter((task) => {
    if (filters.priority !== 'ALL' && task.priority !== filters.priority) return false;
    if (filters.status !== 'ALL' && task.status !== filters.status) return false;
    if (filters.assigneeId === 'UNASSIGNED' ? Boolean(task.assignee) : filters.assigneeId !== 'ALL' && task.assignee?.id !== filters.assigneeId) return false;
    if (filters.label && !task.labels.includes(filters.label)) return false;
    if (query && !`${task.title} ${task.description ?? ''} ${task.labels.join(' ')} ${task.assignee?.displayName ?? ''}`.toLocaleLowerCase().includes(query)) return false;
    const due = dateOnly(task.dueAt);
    if (filters.due === 'NO_DATE' && due) return false;
    if (filters.due === 'OVERDUE' && (!due || due >= today || !isOpen(task))) return false;
    if (filters.due === 'TODAY' && due !== today) return false;
    if (filters.due === 'NEXT_7_DAYS' && (!due || due < today || due > week)) return false;
    const blocked = task.dependsOn.some((item) => item.status !== 'COMPLETED');
    const blocking = task.blocks.some((item) => isOpen(item));
    if (filters.dependency === 'BLOCKED' && !blocked) return false;
    if (filters.dependency === 'BLOCKING' && !blocking) return false;
    if (filters.dependency === 'HAS_DEPENDENCIES' && !task.dependsOn.length && !task.blocks.length) return false;
    if (filters.dependency === 'NONE' && (task.dependsOn.length || task.blocks.length)) return false;
    return true;
  });
  return rows.sort((a, b) => filters.sort === 'TITLE' ? a.title.localeCompare(b.title)
    : filters.sort === 'PRIORITY' ? rank[a.priority] - rank[b.priority] || a.title.localeCompare(b.title)
      : filters.sort === 'DUE_DESC' ? (b.dueAt ?? '').localeCompare(a.dueAt ?? '') || a.title.localeCompare(b.title)
        : (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.title.localeCompare(b.title));
}

/** How many filters are narrowing the view (search counts, sorting does not). */
export const activeFilterCount = (filters: TaskViewFilters) => [filters.search.trim(), filters.status !== 'ALL', filters.priority !== 'ALL', filters.assigneeId !== 'ALL', filters.label, filters.due !== 'ALL', filters.dependency !== 'ALL'].filter(Boolean).length;

export type Workload = { userId: string | null; name: string; assigned: number; completed: number; outstanding: number; overdue: number };
/** One row per person plus an "unassigned" row (userId null). Tasks held by someone off the team still count under their own name. */
export function workload(tasks: Task[], team: { userId: string; displayName: string }[], unassignedLabel: string, now = new Date()): Workload[] {
  const today = dayKey(now);
  const rows = new Map<string | null, Workload>();
  const row = (userId: string | null, name: string) => { if (!rows.has(userId)) rows.set(userId, { userId, name, assigned: 0, completed: 0, outstanding: 0, overdue: 0 }); return rows.get(userId)!; };
  for (const member of team) row(member.userId, member.displayName);
  for (const task of tasks) {
    if (task.status === 'CANCELLED') continue;
    const entry = task.assignee ? row(task.assignee.id, task.assignee.displayName) : row(null, unassignedLabel);
    entry.assigned += 1;
    if (task.status === 'COMPLETED') entry.completed += 1;
    else { entry.outstanding += 1; if (task.dueAt && dateOnly(task.dueAt) < today) entry.overdue += 1; }
  }
  const list = [...rows.values()];
  if (!rows.has(null)) list.push({ userId: null, name: unassignedLabel, assigned: 0, completed: 0, outstanding: 0, overdue: 0 });
  return list.sort((a, b) => Number(a.userId === null) - Number(b.userId === null) || b.outstanding - a.outstanding || a.name.localeCompare(b.name));
}

export type DirectorySort = 'UPDATED' | 'DUE' | 'NAME';
export function directoryRows(projects: Project[], query: string, status: string, sort: DirectorySort): Project[] {
  const needle = query.trim().toLocaleLowerCase();
  const rows = projects.filter((project) => (status === 'ALL' ? project.status !== 'ARCHIVED' : project.status === status)
    && (!needle || `${project.name} ${project.description ?? ''} ${project.owner.displayName}`.toLocaleLowerCase().includes(needle)));
  return rows.sort((a, b) => sort === 'NAME' ? a.name.localeCompare(b.name)
    : sort === 'DUE' ? (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.name.localeCompare(b.name)
      : b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
}
export function directoryCounts(projects: Project[]) {
  const live = projects.filter((project) => project.status !== 'ARCHIVED');
  return { total: live.length, inProgress: live.filter((project) => project.status === 'IN_PROGRESS').length, completed: live.filter((project) => project.status === 'COMPLETED').length, onHold: live.filter((project) => project.status === 'ON_HOLD').length, archived: projects.length - live.length };
}

/** Six-week-or-fewer month grid starting on Monday. Each cell has its date key and whether it belongs to the month. */
export function monthGrid(year: number, month: number): { key: string; day: number; inMonth: boolean }[][] {
  const first = new Date(year, month, 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const weeks: { key: string; day: number; inMonth: boolean }[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const cells = Array.from({ length: 7 }, (_, index) => { const date = addDays(start, week * 7 + index); return { key: dayKey(date), day: date.getDate(), inMonth: date.getMonth() === month }; });
    if (week >= 4 && !cells.some((cell) => cell.inMonth)) break;
    weeks.push(cells);
  }
  return weeks;
}

/** Milestones as a chronological story: undated ones last, finished ones kept in place. */
export function milestoneTimeline(milestones: Milestone[], now = new Date()) {
  const today = dayKey(now);
  const sorted = [...milestones].sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.title.localeCompare(b.title));
  return sorted.map((milestone) => ({ milestone, state: milestone.completedAt ? 'DONE' as const : milestone.dueAt && dateOnly(milestone.dueAt) < today ? 'OVERDUE' as const : 'UPCOMING' as const }));
}

export const slug = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
