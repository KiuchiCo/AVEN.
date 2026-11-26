'use client';

import { useT } from '../../../../i18n';
import { useMemo, useState } from 'react';
import type { TaskActivityEntry } from '../types';
import { formatTaskDate } from '../lib/format-task-date';
import { TaskDetailError } from './task-detail-error';

export function TaskActivityPanel({ entries, loading, error }: { entries: TaskActivityEntry[]; loading: boolean; error: string }) {
  const t = useT();
  const [filter, setFilter] = useState<'ALL' | 'TASK' | 'TASK_COMMENT' | 'TASK_CHECKLIST'>('ALL');
  const counts = useMemo(() => ({ ALL: entries.length, TASK: entries.filter((entry) => entry.entityType === 'TASK').length, TASK_COMMENT: entries.filter((entry) => entry.entityType === 'TASK_COMMENT').length, TASK_CHECKLIST: entries.filter((entry) => entry.entityType === 'TASK_CHECKLIST').length }), [entries]);
  const visibleEntries = filter === 'ALL' ? entries : entries.filter((entry) => entry.entityType === filter);
  const filters = [{ value: 'ALL', label: t('td.filter.all') }, { value: 'TASK', label: t('td.filter.task') }, { value: 'TASK_COMMENT', label: t('td.filter.comment') }, { value: 'TASK_CHECKLIST', label: t('td.filter.checklist') }] as const;
  return <section className="task-collab-panel" aria-labelledby="task-activity-title"><header><div><p className="workspace-eyebrow">{t('td.recent')}</p><h2 id="task-activity-title">{t('td.activity')} <span>{entries.length}</span></h2></div></header>{error && <TaskDetailError message={error} />}{loading ? <p className="productivity-message">{t('td.loadingActivity')}</p> : entries.length ? <><div className="task-activity-filters" role="group" aria-label={t('td.filterActivity')}>{filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label} <span>{counts[item.value]}</span></button>)}</div>{visibleEntries.length ? <ol className="task-activity-list">{visibleEntries.map((entry) => <li key={entry.id}><span aria-hidden="true">{entry.entityType === 'TASK_COMMENT' ? '✧' : entry.entityType === 'TASK_CHECKLIST' ? '☑' : '✓'}</span><div><p><strong>{entry.actor.displayName}</strong> {entry.message}</p><time dateTime={entry.createdAt}>{formatTaskDate(entry.createdAt)}</time></div></li>)}</ol> : <div className="task-collab__empty"><strong>{t('td.noneOfFilter', { filter: filters.find((item) => item.value === filter)?.label ?? '' })}</strong><p>{t('td.otherFilter')}</p><button type="button" onClick={() => setFilter('ALL')}>{t('td.showAll')}</button></div>}</> : <div className="task-collab__empty"><strong>{t('td.noActivity')}</strong><p>{t('td.noActivityText')}</p></div>}</section>;
}
