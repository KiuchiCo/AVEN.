'use client';

import { useTaskComments } from '../hooks/use-task-comments';
import { useTaskChecklist } from '../hooks/use-task-checklist';
import type { TaskCollaborationTab } from '../lib/task-collaboration-tabs';
import type { TaskComment, WorkspaceMember } from '../types';
import { ChecklistPanel } from './checklist-panel';
import { TaskCommentsPanel } from './task-comments-panel';
import { TaskActivityPanel } from './task-activity-panel';

export function TaskCollaborationPanel({ taskId, currentUserId, members, tab }: { taskId: string; currentUserId: string; members: WorkspaceMember[]; tab: TaskCollaborationTab }) {
  if (tab === 'discussion') return <TaskCommentsPanel taskId={taskId} currentUserId={currentUserId} members={members} />;
  if (tab === 'checklist') return <ChecklistPanel taskId={taskId} />;
  return <TaskActivityFeed taskId={taskId} />;
}
function TaskActivityFeed({ taskId }: { taskId: string }) {
  const comments = useTaskComments(taskId); const checklist = useTaskChecklist(taskId);
  return <TaskActivityPanel comments={comments.comments as TaskComment[]} checklist={checklist.items} />;
}
