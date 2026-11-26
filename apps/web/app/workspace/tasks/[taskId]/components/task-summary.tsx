import { TaskLabels } from '../../../task-labels';
import type { TaskSummary } from '../types';
import { useT } from '../../../../i18n';
import { statusKeys } from './task-quick-actions';

export function TaskSummaryCard({ task }: { task: TaskSummary }) {
  const t = useT();
  return <section className="task-detail__summary" aria-label="Task details"><div><span>Status</span><strong>{statusKeys[task.status] ? t(statusKeys[task.status]) : task.status}</strong></div><div><span>Priority</span><strong>{task.priority.charAt(0) + task.priority.slice(1).toLocaleLowerCase()}</strong></div><div><span>Assignee</span><strong>{task.assignee?.displayName ?? 'Unassigned'}</strong></div><div><span>Start date</span><strong>{task.startAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(task.startAt)) : 'Not set'}</strong></div><div><span>Due date</span><strong>{task.dueAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(task.dueAt)) : 'Not set'}</strong></div><div className="task-detail__labels"><span>Labels</span><TaskLabels labels={task.labels ?? []} compact /></div></section>;
}
