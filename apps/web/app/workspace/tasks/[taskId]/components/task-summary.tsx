import { TaskLabels } from '../../../task-labels';
import type { TaskSummary } from '../types';

export function TaskSummaryCard({ task }: { task: TaskSummary }) {
  return <section className="task-detail__summary" aria-label="Task details"><div><span>Status</span><strong>{task.status.replaceAll('_', ' ').toLocaleLowerCase()}</strong></div><div><span>Priority</span><strong>{task.priority.toLocaleLowerCase()}</strong></div><div><span>Assignee</span><strong>{task.assignee?.displayName ?? 'Unassigned'}</strong></div><div><span>Due date</span><strong>{task.dueAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(task.dueAt)) : 'Not set'}</strong></div><div className="task-detail__labels"><span>Labels</span><TaskLabels labels={task.labels ?? []} compact /></div></section>;
}
