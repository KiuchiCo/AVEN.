import Link from 'next/link';
import { useMemo } from 'react';
import { ganttLayout, type GanttTask } from '../gantt';

const week = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function GanttChart({ tasks }: { tasks: GanttTask[] }) {
  const layout = useMemo(() => ganttLayout(tasks, new Date()), [tasks]);
  const undated = tasks.filter((task) => !task.startAt && !task.dueAt).length;
  if (!layout.rows.length) return <p className="productivity-message">Give tasks a start or due date to see them on the chart.</p>;
  return <div className="gantt" role="table" aria-label="Task schedule">
    <div className="gantt__axis" role="row"><span role="columnheader">Task</span><div className="gantt__track" role="columnheader">{layout.ticks.map((tick) => <small key={tick.ms} style={{ left: `${tick.leftPct}%` }}>{week.format(new Date(tick.ms))}</small>)}</div></div>
    {layout.rows.map((row) => <div className="gantt__row" role="row" key={row.id}>
      <Link href={`/workspace/tasks/${row.id}`} role="cell">{row.title}</Link>
      <div className="gantt__track" role="cell">
        {layout.ticks.map((tick) => <i key={tick.ms} className="gantt__grid" style={{ left: `${tick.leftPct}%` }} />)}
        {layout.todayPct !== null && <i className="gantt__today" style={{ left: `${layout.todayPct}%` }} title="Today" />}
        <span className={`gantt__bar gantt__bar--${row.status.toLowerCase()}${row.isRange ? '' : ' gantt__bar--marker'}`} style={{ left: `${row.leftPct}%`, width: `${Math.max(row.widthPct, 0.8)}%` }} title={`${row.title} · ${row.status.replaceAll('_', ' ').toLowerCase()}`} />
      </div>
    </div>)}
    {undated > 0 && <p className="gantt__note">{undated} task{undated === 1 ? ' has' : 's have'} no dates and {undated === 1 ? 'isn’t' : 'aren’t'} shown.</p>}
  </div>;
}
