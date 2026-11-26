'use client';

import { useState } from 'react';
import type { TaskCollaborationTab } from '../lib/task-collaboration-tabs';
import type { TaskSummary, WorkspaceMember } from '../types';
import { TaskCollaborationPanel } from './task-collaboration-panel';
import { TaskDetailHeader } from './task-detail-header';
import { TaskDetailNav } from './task-detail-nav';
import { TaskFollowersPanel } from './task-followers-panel';
import { TaskSummaryCard } from './task-summary';
import { TaskQuickActions } from './task-quick-actions';
import { TaskDetailError } from './task-detail-error';
import { TaskDependenciesPanel } from './task-dependencies-panel';
import { TaskEditPanel } from './task-edit-panel';
import { AttachmentsPanel } from '../../../files/attachments-panel';
import { TaskRepeatPanel } from './task-repeat-panel';
import { TaskSubtasksPanel } from './task-subtasks-panel';

export function TaskDetailView({ task, currentUserId, members, projectTasks, busy, errorMessage, onUpdate, onAddSubtask, onToggleSubtask, onDuplicate, onDelete, onSaveDependencies }: { task: TaskSummary; currentUserId: string; members: WorkspaceMember[]; projectTasks: { id: string; title: string; status: string; project: { id: string; name: string } | null }[]; busy: boolean; errorMessage: string; onUpdate: (fields: Record<string, string | number | null>) => void; onAddSubtask: (title: string) => Promise<boolean>; onToggleSubtask: (subtaskId: string, completed: boolean) => void; onDuplicate: () => void; onDelete: () => void; onSaveDependencies: (ids: string[]) => void }) {
  const [tab, setTab] = useState<TaskCollaborationTab>('discussion');
  return <div className="workspace-section-page task-detail"><TaskDetailHeader task={task} />{errorMessage && <TaskDetailError message={errorMessage} />}<TaskQuickActions task={task} busy={busy} onUpdate={onUpdate} onDuplicate={onDuplicate} onDelete={onDelete} /><TaskEditPanel task={task} members={members} busy={busy} onSave={onUpdate} /><AttachmentsPanel target={{ taskId: task.id }} /><TaskSummaryCard task={task} /><TaskSubtasksPanel task={task} busy={busy} onAdd={onAddSubtask} onToggle={onToggleSubtask} /><TaskRepeatPanel key={`${task.recurrence}-${task.recurrenceInterval}-${task.recurrenceUntil}-${task.dueAt}`} task={task} busy={busy} onSave={onUpdate} /><div className="task-detail__layout"><div><TaskDetailNav active={tab} onChange={setTab} /><TaskCollaborationPanel key={`${task.id}-${tab}`} taskId={task.id} currentUserId={currentUserId} members={members} tab={tab} /></div><aside><TaskDependenciesPanel task={task} tasks={projectTasks} busy={busy} onSave={onSaveDependencies} /><TaskFollowersPanel taskId={task.id} currentUserId={currentUserId} members={members} /><TaskDetailAside task={task} /></aside></div></div>;
}
function TaskDetailAside({ task }: { task: TaskSummary }) {
  return <section className="task-detail__aside"><p className="workspace-eyebrow">Task context</p><h2>Keep the next step clear</h2><p>Use the discussion for decisions, the checklist for work items, and Follow task to stay current.</p>{task.project && <p><strong>Project</strong><br /><a href={`/workspace/projects/${task.project.id}`}>{task.project.name}</a></p>}</section>;
}
