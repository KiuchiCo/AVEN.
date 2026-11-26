import { useT } from '../../../../i18n';
import type { Key } from '../../../../i18n/en';
import Link from 'next/link';
import type { TaskSummary } from '../types';

export function TaskDetailHeader({ task }: { task: TaskSummary }) {
  const t = useT();
  return <header className="task-detail__header"><div><p className="workspace-eyebrow"><Link href="/workspace/projects">{t('td.projects')}</Link>{task.project && <> · <Link href={`/workspace/projects/${task.project.id}`}>{task.project.name}</Link></>} · {t('td.task')}</p><span className={`productivity-priority productivity-priority--${task.priority.toLowerCase()}`}>{t(`prio.${task.priority.toLowerCase()}` as Key).replace(/^./, (c) => c.toLocaleUpperCase())}</span><h1>{task.title}</h1><p>{task.description || t('td.defaultDesc')}</p></div><Link className="task-detail__back" href={task.project ? `/workspace/projects/${task.project.id}` : '/workspace/tasks'}>← {t('td.backToTasks')}</Link></header>;
}
