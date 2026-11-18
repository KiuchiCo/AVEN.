'use client';

import { useMemo, useState } from 'react';
import type { TaskActivityEntry } from '../types';
import { formatTaskDate } from '../lib/format-task-date';
import { TaskDetailError } from './task-detail-error';

export function TaskActivityPanel({ entries, loading, error }: { entries: TaskActivityEntry[]; loading: boolean; error: string }) {
  const [filter, setFilter] = useState<'ALL' | 'TASK' | 'TASK_COMMENT' | 'TASK_CHECKLIST'>('ALL');
  const counts = useMemo(() => ({ ALL: entries.length, TASK: entries.filter((entry) => entry.entityType === 'TASK').length, TASK_COMMENT: entries.filter((entry) => entry.entityType === 'TASK_COMMENT').length, TASK_CHECKLIST: entries.filter((entry) => entry.entityType === 'TASK_CHECKLIST').length }), [entries]);
  const visibleEntries = filter === 'ALL' ? entries : entries.filter((entry) => entry.entityType === filter);
  const filters = [{ value: 'ALL', label: 'All' }, { value: 'TASK', label: 'Task updates' }, { value: 'TASK_COMMENT', label: 'Discussion' }, { value: 'TASK_CHECKLIST', label: 'Checklist' }] as const;
  return <section className="task-collab-panel" aria-labelledby="task-activity-title"><header><div><p className="workspace-eyebrow">RECENT COLLABORATION</p><h2 id="task-activity-title">Task activity <span>{entries.length}</span></h2></div></header>{error && <TaskDetailError message={error} />}{loading ? <p className="productivity-message">Loading task activity…</p> : entries.length ? <><div className="task-activity-filters" role="group" aria-label="Filter task activity">{filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label} <span>{counts[item.value]}</span></button>)}</div>{visibleEntries.length ? <ol className="task-activity-list">{visibleEntries.map((entry) => <li key={entry.id}><span aria-hidden="true">{entry.entityType === 'TASK_COMMENT' ? '✧' : entry.entityType === 'TASK_CHECKLIST' ? '☑' : '✓'}</span><div><p><strong>{entry.actor.displayName}</strong> {entry.message}</p><time dateTime={entry.createdAt}>{formatTaskDate(entry.createdAt)}</time></div></li>)}</ol> : <div className="task-collab__empty"><strong>No {filters.find((item) => item.value === filter)?.label.toLocaleLowerCase()} yet</strong><p>Choose another activity filter to see more updates.</p><button type="button" onClick={() => setFilter('ALL')}>Show all activity</button></div>}</> : <div className="task-collab__empty"><strong>No collaboration activity yet</strong><p>Task updates, comments, and checklist changes will appear here.</p></div>}</section>;
}
