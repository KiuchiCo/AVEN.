'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useT } from '../../../i18n';
import { TaskBadges } from '../../task-badges';
import { Icon, type IconName } from '../../home-icons';
import { Avatar, EmptyState } from '../../ui';
import { useProject } from '../project-context';
import { dateOnly, dayKey, isOpen, taskStatuses, type Task } from '../project-model';
import { PriorityPill, formatDate, taskStatusKey } from '../project-ui';
import type { Key } from '../../../i18n/en';

const columnMeta: Record<string, { icon: IconName; art: 'stack' | 'search' | 'check' | 'folder'; empty: Key; text: Key }> = {
  TODO: { icon: 'list', art: 'stack', empty: 'pj.col.todoEmpty', text: 'pj.col.todoEmptyText' },
  IN_PROGRESS: { icon: 'refresh', art: 'stack', empty: 'pj.col.doingEmpty', text: 'pj.col.doingEmptyText' },
  IN_REVIEW: { icon: 'search', art: 'search', empty: 'pj.col.reviewEmpty', text: 'pj.col.reviewEmptyText' },
  COMPLETED: { icon: 'checkCircle', art: 'check', empty: 'pj.col.doneEmpty', text: 'pj.col.doneEmptyText' },
  CANCELLED: { icon: 'close', art: 'folder', empty: 'pj.col.cancelEmpty', text: 'pj.col.cancelEmptyText' },
};

/** The bits every task view shows the same way: dependency hints, milestone, due date. */
export function TaskMeta({ task }: { task: Task }) {
  const t = useT();
  const waiting = task.dependsOn.filter((item) => item.status !== 'COMPLETED').length;
  const blocking = task.blocks.filter((item) => isOpen(item)).length;
  const overdue = isOpen(task) && task.dueAt && dateOnly(task.dueAt) < dayKey(new Date());
  return <span className="pw-taskmeta">
    {task.dueAt && <span className={overdue ? 'is-overdue' : ''}><Icon name="calendar" size={14} />{formatDate(task.dueAt, '')}{overdue ? ` · ${t('pj.overdue')}` : ''}</span>}
    {task.milestone && <span><Icon name="flag" size={14} />{task.milestone.title}</span>}
    {waiting > 0 && <span className="is-blocked"><Icon name="link" size={14} />{t(waiting === 1 ? 'pj.blockedBy' : 'pj.blockedByMany', { n: waiting })}</span>}
    {blocking > 0 && <span><Icon name="link" size={14} />{t(blocking === 1 ? 'pj.blocksOne' : 'pj.blocksMany', { n: blocking })}</span>}
  </span>;
}

export function SelectBox({ task }: { task: Task }) {
  const t = useT();
  const { selected, setSelected, fail } = useProject();
  return <label className="pw-check"><input type="checkbox" checked={selected.includes(task.id)} aria-label={`${t('pj.selectTask')}: ${task.title}`} onChange={(event) => {
    if (event.target.checked && selected.length >= 500) { fail(new Error(t('pw.bulkLimit')), ''); return; }
    setSelected((ids) => event.target.checked ? [...ids, task.id] : ids.filter((id) => id !== task.id));
  }} /></label>;
}

export function StatusSelect({ task }: { task: Task }) {
  const t = useT();
  const { saveTaskFields, busy, setBusy, fail, clear } = useProject();
  async function change(status: string) { setBusy(true); clear(); try { await saveTaskFields(task, { status }); } catch (reason) { fail(reason, 'Could not update the task.'); } finally { setBusy(false); } }
  return <select className="pw-select-sm" aria-label={t('tasks.statusFor', { title: task.title })} value={task.status} disabled={busy} onChange={(event) => void change(event.target.value)}>{taskStatuses.map((status) => <option key={status} value={status}>{t(taskStatusKey[status])}</option>)}</select>;
}

/** Five status columns. Cards can be dragged between columns, or moved with the status menu on each card. */
export function Board({ rows }: { rows: Task[] }) {
  const t = useT();
  const { openTask, saveTaskFields, setBusy, fail, clear, project } = useProject();
  const [over, setOver] = useState('');
  const archived = project.status === 'ARCHIVED';
  async function drop(status: string, taskId: string) {
    setOver('');
    const task = rows.find((row) => row.id === taskId);
    if (!task || task.status === status) return;
    setBusy(true); clear();
    try { await saveTaskFields(task, { status }); } catch (reason) { fail(reason, 'Could not update the task.'); } finally { setBusy(false); }
  }
  return <div className="pw-board">{taskStatuses.map((status) => {
    const records = rows.filter((task) => task.status === status);
    const meta = columnMeta[status];
    return <section key={status} className={`pw-column${over === status ? ' is-over' : ''}`} aria-label={t('pj.columnAria', { title: t(taskStatusKey[status]), n: records.length })}
      onDragOver={(event) => { if (!archived) { event.preventDefault(); setOver(status); } }} onDragLeave={() => setOver((current) => (current === status ? '' : current))} onDrop={(event) => { event.preventDefault(); void drop(status, event.dataTransfer.getData('text/plain')); }}>
      <h3><span><Icon name={meta.icon} size={18} />{t(taskStatusKey[status])}</span><b>{records.length}</b></h3>
      <div className="pw-column__cards">
        {records.length === 0 ? <EmptyState art={meta.art} compact title={t(meta.empty)} text={t(meta.text)} /> : records.map((task) => <article key={task.id} className="pw-task" draggable={!archived} onDragStart={(event) => event.dataTransfer.setData('text/plain', task.id)}>
          <div className="pw-task__top"><SelectBox task={task} /><Link href={`/workspace/tasks/${task.id}`} className="pw-task__title">{task.title}</Link><button type="button" className="rd-iconbtn" aria-label={t('pw.editNamed', { title: task.title })} onClick={() => openTask(task)}><Icon name="edit" size={16} /></button></div>
          <TaskBadges task={task} />
          {task.labels.length > 0 && <span className="pw-labels">{task.labels.map((label) => <em key={label}>#{label}</em>)}</span>}
          <TaskMeta task={task} />
          <div className="pw-task__foot"><PriorityPill priority={task.priority} />{task.assignee ? <span className="pw-person" title={task.assignee.displayName}><Avatar name={task.assignee.displayName} size={22} /></span> : <span className="pw-person pw-person--none">{t('pj.unassigned')}</span>}<StatusSelect task={task} /></div>
        </article>)}
      </div>
      <button type="button" className="pw-column__add" disabled={archived} onClick={() => openTask(null, { status })}><Icon name="plus" size={16} />{t('pj.addTask')}</button>
    </section>;
  })}</div>;
}
