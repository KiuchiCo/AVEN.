import Link from 'next/link';
import type { TaskSummary } from '../types';

export function TaskDetailHeader({ task }: { task: TaskSummary }) {
  return <header className="task-detail__header"><div><p className="workspace-eyebrow"><Link href="/workspace/projects">Projects</Link>{task.project && <> · <Link href={`/workspace/projects/${task.project.id}`}>{task.project.name}</Link></>} · TASK</p><span className={`productivity-priority productivity-priority--${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span><h1>{task.title}</h1><p>{task.description || 'Keep discussion, checklist, and task followers together.'}</p></div><Link className="task-detail__back" href={task.project ? `/workspace/projects/${task.project.id}` : '/workspace/tasks'}>← Back to tasks</Link></header>;
}
