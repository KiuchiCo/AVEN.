'use client';

import type { TaskCollaborationTab } from '../lib/task-collaboration-tabs';
import { useTaskActivity } from '../hooks/use-task-activity';
import type { WorkspaceMember } from '../types';
import { ChecklistPanel } from './checklist-panel';
import { TaskCommentsPanel } from './task-comments-panel';
import { TaskActivityPanel } from './task-activity-panel';

export function TaskCollaborationPanel({ taskId, currentUserId, members, tab }: { taskId: string; currentUserId: string; members: WorkspaceMember[]; tab: TaskCollaborationTab }) {
  if (tab === 'discussion') return <TaskCommentsPanel taskId={taskId} currentUserId={currentUserId} members={members} />;
  if (tab === 'checklist') return <ChecklistPanel taskId={taskId} />;
  return <TaskActivityFeed taskId={taskId} />;
}
function TaskActivityFeed({ taskId }: { taskId: string }) {
  const { entries, loading, error } = useTaskActivity(taskId);
  return <TaskActivityPanel entries={entries} loading={loading} error={error} />;
}
