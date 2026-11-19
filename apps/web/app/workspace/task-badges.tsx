type BadgeTask = {
  parent?: { id: string; title: string } | null;
  subtasks?: { id: string; status: string }[];
  recurrence?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;
};

/** Small markers shown beside a task title: subtask of, subtask progress, and repeat. */
export function TaskBadges({ task }: { task: BadgeTask }) {
  const subtasks = task.subtasks ?? [];
  const done = subtasks.filter((subtask) => subtask.status === 'COMPLETED').length;
  return <>
    {task.parent && <span className="task-badge">Subtask of {task.parent.title}</span>}
    {subtasks.length > 0 && <span className="task-badge">{done}/{subtasks.length} subtasks</span>}
    {task.recurrence && <span className="task-badge">↻ {task.recurrence.toLowerCase()}</span>}
  </>;
}
