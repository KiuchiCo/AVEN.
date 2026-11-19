export type TaskRow = { id: string; status: string; priority: string; assigneeId: string | null; createdAt: Date; completedAt: Date | null; dueAt: Date | null };
export type UsageRow = { day: string; credits: number };
export type Analytics = ReturnType<typeof buildAnalytics>;

const DAY = 86_400_000;
const closed = (status: string) => status === 'COMPLETED' || status === 'CANCELLED';
export const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const startOfDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Numbers for the Analytics page, worked out from a workspace's tasks. `tasks` should hold every open task plus every
 * task created or completed inside the window. Days are UTC calendar days, the same as task due dates elsewhere.
 */
export function buildAnalytics(input: { tasks: TaskRow[]; usage: UsageRow[]; now: Date; days: number; names: Map<string, string> }) {
  const { tasks, now, days, names } = input;
  const today = startOfDay(now); const from = today - (days - 1) * DAY;
  const dates = Array.from({ length: days }, (_, i) => dayKey(new Date(from + i * DAY)));
  const created = new Map<string, number>(); const completed = new Map<string, number>();
  const cycle: number[] = [];
  for (const task of tasks) {
    const c = dayKey(task.createdAt); if (startOfDay(task.createdAt) >= from) created.set(c, (created.get(c) ?? 0) + 1);
    if (task.status === 'COMPLETED' && task.completedAt && startOfDay(task.completedAt) >= from && startOfDay(task.completedAt) <= today) {
      const k = dayKey(task.completedAt); completed.set(k, (completed.get(k) ?? 0) + 1);
      cycle.push(Math.max(0, (task.completedAt.getTime() - task.createdAt.getTime()) / DAY));
    }
  }
  const daily = dates.map((date) => ({ date, created: created.get(date) ?? 0, completed: completed.get(date) ?? 0 }));
  const open = tasks.filter((task) => !closed(task.status));
  const overdue = open.filter((task) => task.dueAt && startOfDay(task.dueAt) < today);
  const dueSoon = open.filter((task) => task.dueAt && startOfDay(task.dueAt) >= today && startOfDay(task.dueAt) <= today + 7 * DAY);

  const byStatus: Record<string, number> = {}; for (const task of open) byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
  const byPriority: Record<string, number> = {}; for (const task of open) byPriority[task.priority] = (byPriority[task.priority] ?? 0) + 1;
  const load = new Map<string, { open: number; overdue: number }>();
  for (const task of open) { const key = task.assigneeId ?? ''; const row = load.get(key) ?? { open: 0, overdue: 0 }; row.open += 1; if (task.dueAt && startOfDay(task.dueAt) < today) row.overdue += 1; load.set(key, row); }
  const workload = [...load].map(([id, row]) => ({ assigneeId: id || null, name: id ? names.get(id) ?? 'Former member' : 'Unassigned', ...row })).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  const usage = new Map(input.usage.map((row) => [row.day, row.credits]));
  const totalCreated = daily.reduce((sum, d) => sum + d.created, 0); const totalCompleted = daily.reduce((sum, d) => sum + d.completed, 0);
  return {
    range: { from: dates[0], to: dates[dates.length - 1], days },
    totals: { created: totalCreated, completed: totalCompleted, open: open.length, overdue: overdue.length, dueSoon: dueSoon.length },
    daily,
    cycleDays: { count: cycle.length, average: cycle.length ? round1(cycle.reduce((a, b) => a + b, 0) / cycle.length) : null, median: median(cycle) === null ? null : round1(median(cycle)!) },
    openByStatus: byStatus, openByPriority: byPriority, workload,
    aiCredits: dates.map((date) => ({ date, credits: usage.get(date) ?? 0 })),
  };
}
