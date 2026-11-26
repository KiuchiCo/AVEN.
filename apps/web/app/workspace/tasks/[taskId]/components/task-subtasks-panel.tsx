'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { TaskSummary } from '../types';

export function TaskSubtasksPanel({ task, busy, onAdd, onToggle }: { task: TaskSummary; busy: boolean; onAdd: (title: string) => Promise<boolean>; onToggle: (subtaskId: string, completed: boolean) => void }) {
  const [title, setTitle] = useState('');

  if (task.parent) {
    return <section className="task-subtasks" aria-label="Parent task"><p className="workspace-eyebrow">Subtask</p><p>Part of <Link href={`/workspace/tasks/${task.parent.id}`}>{task.parent.title}</Link></p></section>;
  }

  const done = task.subtasks.filter((subtask) => subtask.status === 'COMPLETED' || subtask.status === 'CANCELLED').length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    if (await onAdd(value)) setTitle('');
  }

  return <section className="task-subtasks" aria-label="Subtasks">
    <div className="task-subtasks__heading"><div><p className="workspace-eyebrow">Subtasks</p><h2>Break this task down</h2></div>{task.subtasks.length > 0 && <span>{done} of {task.subtasks.length} done</span>}</div>
    {task.subtasks.length > 0 && <ul>{task.subtasks.map((subtask) => <li key={subtask.id} className={subtask.status === 'COMPLETED' ? 'is-done' : ''}>
      <label><input type="checkbox" checked={subtask.status === 'COMPLETED'} disabled={busy || subtask.status === 'CANCELLED'} onChange={(event) => onToggle(subtask.id, event.target.checked)} /><span className="visually-hidden">Mark {subtask.title} complete</span></label>
      <Link href={`/workspace/tasks/${subtask.id}`}>{subtask.title}</Link>{subtask.status === 'CANCELLED' && <small>cancelled</small>}
    </li>)}</ul>}
    <form onSubmit={(event) => void submit(event)}>
      <input aria-label="New subtask" value={title} maxLength={200} placeholder="Add a subtask…" onChange={(event) => setTitle(event.target.value)} />
      <button type="submit" disabled={busy || !title.trim()}>Add subtask</button>
    </form>
    <p className="task-subtasks__note">The task can’t be completed until its subtasks are completed or cancelled.</p>
  </section>;
}
