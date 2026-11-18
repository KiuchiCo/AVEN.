'use client';

import type { TaskSummary } from '../types';
const statuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED'];
export function TaskQuickActions({ task, busy, onUpdate, onDuplicate, onDelete }: { task: TaskSummary; busy: boolean; onUpdate: (fields: Record<string, string | null>) => void; onDuplicate: () => void; onDelete: () => void }) {
  return <section className="task-quick-actions" aria-label="Update task"><label>Status<select value={task.status} disabled={busy} onChange={(event) => onUpdate({ status: event.target.value })}>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ').toLocaleLowerCase()}</option>)}</select></label><label>Priority<select value={task.priority} disabled={busy} onChange={(event) => onUpdate({ priority: event.target.value })}>{['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((priority) => <option key={priority} value={priority}>{priority.toLocaleLowerCase()}</option>)}</select></label><label>Due date<input type="date" value={task.dueAt?.slice(0,10) ?? ''} disabled={busy} onChange={(event) => onUpdate({ dueAt: event.target.value || null })} /></label><button type="button" disabled={busy} onClick={onDuplicate}>{busy ? 'Working…' : 'Duplicate task'}</button><button type="button" className="task-quick-actions__delete" disabled={busy} onClick={onDelete}>Delete task</button></section>;
}
