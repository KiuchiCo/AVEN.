export type GanttTask = { id: string; title: string; status: string; startAt: string | null; dueAt: string | null };
export type GanttRow = { id: string; title: string; status: string; leftPct: number; widthPct: number; isRange: boolean };
export type Gantt = { rows: GanttRow[]; ticks: { leftPct: number; ms: number }[]; todayPct: number | null; days: number };

const DAY = 86_400_000;
const dayStart = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };

/**
 * Lays tasks out on a shared day scale. A task with both dates is a bar from start to due (inclusive);
 * with only one date it is a one-day marker on that date. Tasks with neither are left out.
 */
export function ganttLayout(tasks: GanttTask[], now: Date, limit = 60): Gantt {
  const dated = tasks.filter((task) => task.startAt || task.dueAt).map((task) => {
    const a = dayStart((task.startAt ?? task.dueAt) as string); const b = dayStart((task.dueAt ?? task.startAt) as string);
    return { task, start: Math.min(a, b), end: Math.max(a, b) + DAY };
  }).sort((x, y) => x.start - y.start || x.end - y.end).slice(0, limit);
  if (!dated.length) return { rows: [], ticks: [], todayPct: null, days: 0 };
  const rangeStart = Math.min(...dated.map((item) => item.start)) - 2 * DAY;
  const rangeEnd = Math.max(rangeStart + 14 * DAY, Math.max(...dated.map((item) => item.end)) + 2 * DAY);
  const span = rangeEnd - rangeStart;
  const pct = (ms: number) => ((ms - rangeStart) / span) * 100;
  const ticks: Gantt['ticks'] = [];
  for (let ms = rangeStart; ms < rangeEnd; ms += 7 * DAY) ticks.push({ leftPct: pct(ms), ms });
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    rows: dated.map(({ task, start, end }) => ({ id: task.id, title: task.title, status: task.status, leftPct: pct(start), widthPct: ((end - start) / span) * 100, isRange: Boolean(task.startAt && task.dueAt) })),
    ticks, todayPct: today >= rangeStart && today <= rangeEnd ? pct(today) : null, days: Math.round(span / DAY),
  };
}
