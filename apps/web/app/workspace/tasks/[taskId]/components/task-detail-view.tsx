'use client';

import { useT } from '../../../../i18n';
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
  const t = useT();
  const [tab, setTab] = useState<TaskCollaborationTab>('discussion');
  // Two columns on wide screens: the work (description, subtasks, discussion) and the task's properties beside it.
  // The properties come first in the page order, so phones show status, priority and dates before the long content.
  return <div className="workspace-section-page task-detail">
    <TaskDetailHeader task={task} />
    {errorMessage && <TaskDetailError message={errorMessage} />}
    <div className="task-detail__grid">
      <aside className="task-detail__side" aria-label={t('td.properties')}>
        <TaskQuickActions task={task} busy={busy} onUpdate={onUpdate} />
        <TaskSummaryCard task={task} />
        <TaskRepeatPanel key={`${task.recurrence}-${task.recurrenceInterval}-${task.recurrenceUntil}-${task.dueAt}`} task={task} busy={busy} onSave={onUpdate} />
        <AttachmentsPanel target={{ taskId: task.id }} />
        <TaskDependenciesPanel task={task} tasks={projectTasks} busy={busy} onSave={onSaveDependencies} />
        <TaskFollowersPanel taskId={task.id} currentUserId={currentUserId} members={members} />
        <div className="task-detail__danger"><button type="button" disabled={busy} onClick={onDuplicate}>{busy ? t('td.working') : t('td.duplicate')}</button><button type="button" className="task-quick-actions__delete" disabled={busy} onClick={onDelete}>{t('td.deleteTask')}</button></div>
      </aside>
      <div className="task-detail__main">
        <TaskEditPanel task={task} members={members} busy={busy} onSave={onUpdate} />
        <TaskSubtasksPanel task={task} busy={busy} onAdd={onAddSubtask} onToggle={onToggleSubtask} />
        <section className="task-detail__collab"><TaskDetailNav active={tab} onChange={setTab} /><TaskCollaborationPanel key={`${task.id}-${tab}`} taskId={task.id} currentUserId={currentUserId} members={members} tab={tab} /></section>
      </div>
    </div>
  </div>;
}
