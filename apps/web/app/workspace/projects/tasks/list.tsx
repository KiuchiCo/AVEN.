'use client';

import Link from 'next/link';
import { useT } from '../../../i18n';
import { Icon } from '../../home-icons';
import { PersonChip, PriorityPill } from '../project-ui';
import { useProject } from '../project-context';
import type { Task } from '../project-model';
import { SelectBox, StatusSelect, TaskMeta } from './board';

/** A table on wide screens that turns into stacked cards on narrow ones, so nothing needs sideways scrolling. */
export function TaskList({ rows }: { rows: Task[] }) {
  const t = useT();
  const { openTask, selected, setSelected } = useProject();
  const all = rows.length > 0 && rows.every((task) => selected.includes(task.id));
  return <div className="pw-table" role="table" aria-label={t('pw.taskList')}>
    <div className="pw-table__head" role="row">
      <span role="columnheader"><label className="pw-check"><input type="checkbox" checked={all} aria-label={t('pw.selectAllVisible', { n: rows.length })} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, ...rows.slice(0, 500).map((task) => task.id)])] : current.filter((id) => !rows.some((task) => task.id === id)))} /></label></span>
      <span role="columnheader">{t('pw.col.task')}</span><span role="columnheader">{t('pj.status')}</span><span role="columnheader">{t('pj.priority')}</span><span role="columnheader">{t('pj.assignee')}</span><span role="columnheader">{t('pj.dueDate')}</span><span role="columnheader"><span className="visually-hidden">{t('file.colActions')}</span></span>
    </div>
    {rows.map((task) => <div key={task.id} className="pw-table__row" role="row">
      <span role="cell" className="pw-table__select"><SelectBox task={task} /></span>
      <span role="cell" className="pw-table__task"><Link href={`/workspace/tasks/${task.id}`}>{task.title}</Link>{task.labels.length > 0 && <span className="pw-labels">{task.labels.map((label) => <em key={label}>#{label}</em>)}</span>}<TaskMeta task={task} /></span>
      <span role="cell" data-label={t('pj.status')}><StatusSelect task={task} /></span>
      <span role="cell" data-label={t('pj.priority')}><PriorityPill priority={task.priority} /></span>
      <span role="cell" data-label={t('pj.assignee')}><PersonChip name={task.assignee?.displayName} /></span>
      <span role="cell" data-label={t('pj.dueDate')} className="pw-table__due">{task.dueAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(task.dueAt)) : '—'}</span>
      <span role="cell" className="pw-table__edit"><button type="button" className="rd-iconbtn" aria-label={t('pw.editNamed', { title: task.title })} onClick={() => openTask(task)}><Icon name="edit" size={16} /></button></span>
    </div>)}
  </div>;
}
