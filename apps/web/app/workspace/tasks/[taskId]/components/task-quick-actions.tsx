'use client';

import type { TaskSummary } from '../types';
import { useT } from '../../../../i18n';
import type { Key } from '../../../../i18n/en';
const statuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED'];
/** The same status names the boards and lists use ("To do", not the raw "Todo"). */
export const statusKeys: Record<string, Key> = { TODO: 'status.todo', IN_PROGRESS: 'status.inProgress', IN_REVIEW: 'status.inReview', COMPLETED: 'status.completed', CANCELLED: 'status.cancelled' };
export function TaskQuickActions({ task, busy, onUpdate }: { task: TaskSummary; busy: boolean; onUpdate: (fields: Record<string, string | null>) => void }) {
  const t = useT();
  return <section className="task-quick-actions" aria-label={t('td.updateAria')}><label>{t('td.status')}<select value={task.status} disabled={busy} onChange={(event) => onUpdate({ status: event.target.value })}>{statuses.map((status) => <option key={status} value={status}>{t(statusKeys[status])}</option>)}</select></label><label>{t('td.priority')}<select value={task.priority} disabled={busy} onChange={(event) => onUpdate({ priority: event.target.value })}>{['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((priority) => <option key={priority} value={priority}>{t(`prio.${priority.toLowerCase()}` as Key).replace(/^./, (c) => c.toLocaleUpperCase())}</option>)}</select></label><label>{t('td.startDate')}<input type="date" value={task.startAt?.slice(0,10) ?? ''} disabled={busy} onChange={(event) => onUpdate({ startAt: event.target.value || null })} /></label><label>{t('td.dueDate')}<input type="date" value={task.dueAt?.slice(0,10) ?? ''} disabled={busy} onChange={(event) => onUpdate({ dueAt: event.target.value || null })} /></label></section>;
}
