import { TaskLabels } from '../../../task-labels';
import type { TaskSummary, WorkspaceMember } from '../types';
import { useT } from '../../../../i18n';

export function TaskSummaryCard({ task, members, busy, onUpdate }: { task: TaskSummary; members: WorkspaceMember[]; busy: boolean; onUpdate: (fields: Record<string, string | null>) => void }) {
  const t = useT();
  return <section className="task-detail__summary" aria-label={t('td.detailsAria')}>
    <label className="task-detail__assignee"><span>{t('td.assignee')}</span><select value={task.assignee?.id ?? ''} disabled={busy} onChange={(event) => onUpdate({ assigneeId: event.target.value || null })}><option value="">{t('td.unassigned')}</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label>
    <div className="task-detail__labels"><span>{t('td.labels')}</span><TaskLabels labels={task.labels ?? []} compact /></div>
  </section>;
}
