import { TaskLabels } from '../../../task-labels';
import type { TaskSummary } from '../types';
import { useT } from '../../../../i18n';

export function TaskSummaryCard({ task }: { task: TaskSummary }) {
  const t = useT();
  return <section className="task-detail__summary" aria-label={t('td.detailsAria')}><div><span>{t('td.assignee')}</span><strong>{task.assignee?.displayName ?? t('td.unassigned')}</strong></div><div className="task-detail__labels"><span>{t('td.labels')}</span><TaskLabels labels={task.labels ?? []} compact /></div></section>;
}
