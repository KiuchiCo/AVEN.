import type { Key } from '../../../../i18n/en';
import { TaskLabels } from '../../../task-labels';
import type { TaskSummary } from '../types';
import { useT } from '../../../../i18n';
import { statusKeys } from './task-quick-actions';

export function TaskSummaryCard({ task }: { task: TaskSummary }) {
  const t = useT();
  return <section className="task-detail__summary" aria-label={t('td.detailsAria')}><div><span>{t('td.status')}</span><strong>{statusKeys[task.status] ? t(statusKeys[task.status]) : task.status}</strong></div><div><span>{t('td.priority')}</span><strong>{t(`prio.${task.priority.toLowerCase()}` as Key).replace(/^./, (c) => c.toLocaleUpperCase())}</strong></div><div><span>{t('td.assignee')}</span><strong>{task.assignee?.displayName ?? t('td.unassigned')}</strong></div><div><span>{t('td.startDate')}</span><strong>{task.startAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(task.startAt)) : t('td.notSet')}</strong></div><div><span>{t('td.dueDate')}</span><strong>{task.dueAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(task.dueAt)) : t('td.notSet')}</strong></div><div className="task-detail__labels"><span>{t('td.labels')}</span><TaskLabels labels={task.labels ?? []} compact /></div></section>;
}
