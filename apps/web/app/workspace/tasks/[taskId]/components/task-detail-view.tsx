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

export function TaskDetailView({ task, currentUserId, members, busy, errorMessage, onUpdate }: { task: TaskSummary; currentUserId: string; members: WorkspaceMember[]; busy: boolean; errorMessage: string; onUpdate: (fields: Record<string, string | null>) => void }) {
  const [tab, setTab] = useState<TaskCollaborationTab>('discussion');
  return <div className="workspace-section-page task-detail"><TaskDetailHeader task={task} />{errorMessage && <TaskDetailError message={errorMessage} />}<TaskQuickActions task={task} busy={busy} onUpdate={onUpdate} /><TaskSummaryCard task={task} /><div className="task-detail__layout"><div><TaskDetailNav active={tab} onChange={setTab} /><TaskCollaborationPanel key={`${task.id}-${tab}`} taskId={task.id} currentUserId={currentUserId} members={members} tab={tab} /></div><aside><TaskFollowersPanel taskId={task.id} currentUserId={currentUserId} members={members} /><TaskDetailAside task={task} /></aside></div></div>;
}
function TaskDetailAside({ task }: { task: TaskSummary }) {
  return <section className="task-detail__aside"><p className="workspace-eyebrow">TASK CONTEXT</p><h2>Keep the next step clear</h2><p>Use the discussion for decisions, the checklist for work items, and Follow task to stay current.</p>{task.project && <p><strong>Project</strong><br /><a href={`/workspace/projects/${task.project.id}`}>{task.project.name}</a></p>}</section>;
}
