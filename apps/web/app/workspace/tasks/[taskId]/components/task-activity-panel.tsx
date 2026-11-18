import type { TaskActivityEntry } from '../types';
import { formatTaskDate } from '../lib/format-task-date';
import { TaskDetailError } from './task-detail-error';

export function TaskActivityPanel({ entries, loading, error }: { entries: TaskActivityEntry[]; loading: boolean; error: string }) {
  return <section className="task-collab-panel" aria-labelledby="task-activity-title"><header><div><p className="workspace-eyebrow">RECENT COLLABORATION</p><h2 id="task-activity-title">Task activity <span>{entries.length}</span></h2></div></header>{error && <TaskDetailError message={error} />}{loading ? <p className="productivity-message">Loading task activity…</p> : entries.length ? <ol className="task-activity-list">{entries.map((entry) => <li key={entry.id}><span aria-hidden="true">{entry.entityType === 'TASK_COMMENT' ? '✧' : entry.entityType === 'TASK_CHECKLIST' ? '☑' : '✓'}</span><div><p><strong>{entry.actor.displayName}</strong> {entry.message}</p><time dateTime={entry.createdAt}>{formatTaskDate(entry.createdAt)}</time></div></li>)}</ol> : <div className="task-collab__empty"><strong>No collaboration activity yet</strong><p>Task updates, comments, and checklist changes will appear here.</p></div>}</section>;
}
