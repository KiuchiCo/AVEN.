'use client';

import { useAuth } from '@clerk/nextjs';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useWorkspaceSession } from '../../workspace-shell';
import { TaskDetailError } from './components/task-detail-error';
import { TaskDetailLoading } from './components/task-detail-loading';
import { TaskDetailView } from './components/task-detail-view';
import { useTaskDetail } from './hooks/use-task-detail';
import { useTaskMembers } from './hooks/use-task-members';
import type { TaskSummary } from './types';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>(); const router = useRouter(); const { getToken } = useAuth(); const { workspace, user } = useWorkspaceSession();
  const { members } = useTaskMembers(); const { task, loading, error, reload } = useTaskDetail(taskId); const [errorMessage, setErrorMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function updateTask(fields: Record<string, string | null>) { const token = await getToken(); if (!token || !apiBase) return; setBusy(true); try { const response = await fetch(`${apiBase}/workspaces/${workspace.id}/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(fields) }); if (!response.ok) throw new Error('Could not update this task.'); await reload(); } catch (reason) { setErrorMessage(reason instanceof Error ? reason.message : 'Could not update this task.'); } finally { setBusy(false); } }
  async function duplicateTask() { const token = await getToken(); if (!token || !apiBase) return; setBusy(true); setErrorMessage(''); try { const response = await fetch(`${apiBase}/workspaces/${workspace.id}/tasks/${taskId}/duplicate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); const body = await response.json().catch(() => null) as { id?: string; message?: string } | null; if (!response.ok || !body?.id) throw new Error(body?.message ?? 'Could not duplicate this task.'); router.push(`/workspace/tasks/${body.id}`); } catch (reason) { setErrorMessage(reason instanceof Error ? reason.message : 'Could not duplicate this task.'); } finally { setBusy(false); } }
  if (loading) return <TaskDetailLoading />;
  if (error || !task) return <div className="workspace-section-page task-detail"><TaskDetailError message={error || errorMessage || 'Task unavailable.'} /><a href="/workspace/tasks">Back to My Tasks</a></div>;
  return <TaskDetailView task={task} currentUserId={user.id} members={members} busy={busy} errorMessage={errorMessage} onUpdate={(fields) => void updateTask(fields)} onDuplicate={() => void duplicateTask()} />;
}
