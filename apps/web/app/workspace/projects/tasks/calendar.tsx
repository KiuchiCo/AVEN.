'use client';

import { useMemo, useState } from 'react';
import { useT } from '../../../i18n';
import { Icon } from '../../home-icons';
import { useProject } from '../project-context';
import { dateOnly, dayKey, monthGrid, type Task } from '../project-model';
import { PriorityPill } from '../project-ui';

/** Tasks laid out on a month by due date. Pick a day to see its tasks underneath, which also works on a phone. */
export function TaskCalendar({ rows }: { rows: Task[] }) {
  const t = useT();
  const { openTask } = useProject();
  const [cursor, setCursor] = useState(() => { const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() }; });
  const [day, setDay] = useState(() => dayKey(new Date()));
  const today = dayKey(new Date());
  const byDay = useMemo(() => { const map = new Map<string, Task[]>(); for (const task of rows) { const key = dateOnly(task.dueAt); if (key) map.set(key, [...(map.get(key) ?? []), task]); } return map; }, [rows]);
  const weeks = monthGrid(cursor.year, cursor.month);
  const title = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(cursor.year, cursor.month, 1));
  const weekdays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2026, 5, 1 + index)));
  const shift = (by: number) => setCursor((current) => { const next = new Date(current.year, current.month + by, 1); return { year: next.getFullYear(), month: next.getMonth() }; });
  const undated = rows.filter((task) => !task.dueAt);
  const dayTasks = byDay.get(day) ?? [];
  return <div className="pw-calendar">
    <div className="pw-calendar__bar"><h3 aria-live="polite">{title}</h3><div><button type="button" className="rd-iconbtn" aria-label={t('pw.prevMonth')} onClick={() => shift(-1)}><Icon name="chevron" size={16} /></button><button type="button" className="rd-btn rd-btn--soft rd-btn--small" onClick={() => { const now = new Date(); setCursor({ year: now.getFullYear(), month: now.getMonth() }); setDay(today); }}>{t('pw.today')}</button><button type="button" className="rd-iconbtn" aria-label={t('pw.nextMonth')} onClick={() => shift(1)}><Icon name="chevron" size={16} /></button></div></div>
    <div className="pw-calendar__grid" role="grid" aria-label={title}>
      {weekdays.map((name) => <span key={name} className="pw-calendar__dow" role="columnheader">{name}</span>)}
      {weeks.flat().map((cell) => { const list = byDay.get(cell.key) ?? []; return <div key={cell.key} role="gridcell" className={`pw-calendar__cell${cell.inMonth ? '' : ' is-out'}${cell.key === today ? ' is-today' : ''}${cell.key === day ? ' is-picked' : ''}`}>
        <button type="button" className="pw-calendar__day" aria-label={`${cell.key}, ${t('pj.taskMany', { n: list.length })}`} aria-pressed={cell.key === day} onClick={() => setDay(cell.key)}>{cell.day}{list.length > 0 && <b>{list.length}</b>}</button>
        <span className="pw-calendar__chips">{list.slice(0, 2).map((task) => <button type="button" key={task.id} className={`pw-chip pw-chip--${task.status.toLowerCase()}`} onClick={() => openTask(task)}>{task.title}</button>)}{list.length > 2 && <small>{t('pw.moreN', { n: list.length - 2 })}</small>}</span>
      </div>; })}
    </div>
    <section className="pw-calendar__day-list" aria-label={t('pw.tasksOn', { date: day })}>
      <h4>{new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date(`${day}T12:00:00`))}</h4>
      {dayTasks.length === 0 ? <p className="pw-muted">{t('pw.nothingDue')}</p> : <ul>{dayTasks.map((task) => <li key={task.id}><button type="button" onClick={() => openTask(task)}>{task.title}</button><PriorityPill priority={task.priority} /></li>)}</ul>}
    </section>
    {undated.length > 0 && <section className="pw-calendar__day-list"><h4>{t('pw.undated', { n: undated.length })}</h4><ul>{undated.map((task) => <li key={task.id}><button type="button" onClick={() => openTask(task)}>{task.title}</button><PriorityPill priority={task.priority} /></li>)}</ul></section>}
  </div>;
}
