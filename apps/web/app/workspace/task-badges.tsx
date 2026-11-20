import { useT } from '../i18n';
import type { Key } from '../i18n/en';

type BadgeTask = {
  parent?: { id: string; title: string } | null;
  subtasks?: { id: string; status: string }[];
  recurrence?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;
};

/** Small markers shown beside a task title: subtask of, subtask progress, and repeat. */
export function TaskBadges({ task }: { task: BadgeTask }) {
  const t = useT();
  const subtasks = task.subtasks ?? [];
  const done = subtasks.filter((subtask) => subtask.status === 'COMPLETED').length;
  return <>
    {task.parent && <span className="task-badge">{t('badge.subtaskOf', { title: task.parent.title })}</span>}
    {subtasks.length > 0 && <span className="task-badge">{t('badge.subtasks', { done, total: subtasks.length })}</span>}
    {task.recurrence && <span className="task-badge">↻ {t(`rec.${task.recurrence.toLowerCase()}` as Key)}</span>}
  </>;
}
