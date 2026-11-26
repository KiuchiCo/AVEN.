'use client';

import { useT } from '../../../../i18n';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { TaskSummary } from '../types';

export function TaskSubtasksPanel({ task, busy, onAdd, onToggle }: { task: TaskSummary; busy: boolean; onAdd: (title: string) => Promise<boolean>; onToggle: (subtaskId: string, completed: boolean) => void }) {
  const t = useT();
  const [title, setTitle] = useState('');

  if (task.parent) {
    return <section className="task-subtasks" aria-label={t('td.parentAria')}><p className="workspace-eyebrow">{t('td.subtask')}</p><p>{t('td.partOf')} <Link href={`/workspace/tasks/${task.parent.id}`}>{task.parent.title}</Link></p></section>;
  }

  const done = task.subtasks.filter((subtask) => subtask.status === 'COMPLETED' || subtask.status === 'CANCELLED').length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    if (await onAdd(value)) setTitle('');
  }

  return <section className="task-subtasks" aria-label={t('td.subtasks')}>
    <div className="task-subtasks__heading"><div><p className="workspace-eyebrow">{t('td.subtasks')}</p><h2>{t('td.breakDown')}</h2></div>{task.subtasks.length > 0 && <span>{t('td.doneOf', { done, total: task.subtasks.length })}</span>}</div>
    {task.subtasks.length > 0 && <ul>{task.subtasks.map((subtask) => <li key={subtask.id} className={subtask.status === 'COMPLETED' ? 'is-done' : ''}>
      <label><input type="checkbox" checked={subtask.status === 'COMPLETED'} disabled={busy || subtask.status === 'CANCELLED'} onChange={(event) => onToggle(subtask.id, event.target.checked)} /><span className="visually-hidden">{t('td.markComplete', { title: subtask.title })}</span></label>
      <Link href={`/workspace/tasks/${subtask.id}`}>{subtask.title}</Link>{subtask.status === 'CANCELLED' && <small>{t('td.cancelled')}</small>}
    </li>)}</ul>}
    <form onSubmit={(event) => void submit(event)}>
      <input aria-label={t('td.newSubtask')} value={title} maxLength={200} placeholder={t('td.subtaskPh')} onChange={(event) => setTitle(event.target.value)} />
      <button type="submit" disabled={busy || !title.trim()}>{t('td.addSubtask')}</button>
    </form>
    <p className="task-subtasks__note">{t('td.subtaskNote')}</p>
  </section>;
}
