import type { ChecklistItem, TaskComment } from '../types';
import { formatTaskDate } from '../lib/format-task-date';

type Entry = { id: string; at: string; text: string };
export function TaskActivityPanel({ comments, checklist }: { comments: TaskComment[]; checklist: ChecklistItem[] }) {
  const entries: Entry[] = [
    ...comments.map((comment) => ({ id: `comment-${comment.id}`, at: comment.createdAt, text: `${comment.author.displayName} commented: “${comment.body.slice(0, 100)}${comment.body.length > 100 ? '…' : ''}”` })),
    ...checklist.map((item) => ({ id: `checklist-${item.id}`, at: item.completedAt ?? item.createdAt, text: item.completedAt ? `${item.completedBy?.displayName ?? 'A teammate'} completed “${item.title}”` : `${item.createdBy.displayName} added “${item.title}”` })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return <section className="task-collab-panel" aria-labelledby="task-activity-title"><header><div><p className="workspace-eyebrow">RECENT COLLABORATION</p><h2 id="task-activity-title">Task activity</h2></div></header>{entries.length ? <ol className="task-activity-list">{entries.map((entry) => <li key={entry.id}><span aria-hidden="true">◷</span><div><p>{entry.text}</p><time dateTime={entry.at}>{formatTaskDate(entry.at)}</time></div></li>)}</ol> : <div className="task-collab__empty"><strong>No collaboration activity yet</strong><p>Comments and checklist updates will appear here.</p></div>}</section>;
}
