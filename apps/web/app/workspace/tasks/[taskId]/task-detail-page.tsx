'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useWorkspaceSession } from '../../workspace-shell';
import { TaskDetailError } from './components/task-detail-error';
import { TaskDetailLoading } from './components/task-detail-loading';
import { TaskDetailView } from './components/task-detail-view';
import { useTaskDetail } from './hooks/use-task-detail';
import { useTaskMembers } from './hooks/use-task-members';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>(); const router = useRouter(); const { getToken } = useAuth(); const { workspace, user } = useWorkspaceSession();
  const { members } = useTaskMembers(); const { task, loading, error, reload } = useTaskDetail(taskId); const [errorMessage, setErrorMessage] = useState(''); const [busy, setBusy] = useState(false); const [projectTasks, setProjectTasks] = useState<{ id: string; title: string; status: string; project: { id: string; name: string } | null }[]>([]);
  const loadProjectTasks = useCallback(async () => {
    const token = await getToken(); if (!token || !apiBase) return;
    const response = await fetch(`${apiBase}/workspaces/${workspace.id}/tasks`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Could not load project tasks for dependencies.');
    setProjectTasks(await response.json());
  }, [getToken, workspace.id]);
  useEffect(() => { if (task?.project) void loadProjectTasks().catch((reason) => setErrorMessage(reason instanceof Error ? reason.message : 'Could not load project tasks.')); }, [loadProjectTasks, task?.id, task?.project]);
  async function updateTask(fields: Record<string, string | null>) { const token = await getToken(); if (!token || !apiBase) return; setBusy(true); try { const response = await fetch(`${apiBase}/workspaces/${workspace.id}/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(fields) }); if (!response.ok) throw new Error('Could not update this task.'); await reload(); } catch (reason) { setErrorMessage(reason instanceof Error ? reason.message : 'Could not update this task.'); } finally { setBusy(false); } }
  async function duplicateTask() { const token = await getToken(); if (!token || !apiBase) return; setBusy(true); setErrorMessage(''); try { const response = await fetch(`${apiBase}/workspaces/${workspace.id}/tasks/${taskId}/duplicate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); const body = await response.json().catch(() => null) as { id?: string; message?: string } | null; if (!response.ok || !body?.id) throw new Error(body?.message ?? 'Could not duplicate this task.'); router.push(`/workspace/tasks/${body.id}`); } catch (reason) { setErrorMessage(reason instanceof Error ? reason.message : 'Could not duplicate this task.'); } finally { setBusy(false); } }
  async function deleteTask() { if (!window.confirm('Delete this task? Its checklist, comments, and follower links will also be removed.')) return; const token = await getToken(); if (!token || !apiBase) return; setBusy(true); setErrorMessage(''); try { const response = await fetch(`${apiBase}/workspaces/${workspace.id}/tasks/${taskId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); const body = await response.json().catch(() => null) as { message?: string } | null; if (!response.ok) throw new Error(body?.message ?? 'Could not delete this task.'); router.push(task?.project ? `/workspace/projects/${task.project.id}` : '/workspace/tasks'); } catch (reason) { setErrorMessage(reason instanceof Error ? reason.message : 'Could not delete this task.'); } finally { setBusy(false); } }
  async function saveDependencies(ids: string[]) { const token = await getToken(); if (!token || !apiBase) return; setBusy(true); setErrorMessage(''); try { const response = await fetch(`${apiBase}/workspaces/${workspace.id}/tasks/${taskId}/dependencies`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ dependsOnTaskIds: ids }) }); const body = await response.json().catch(() => null) as { message?: string } | null; if (!response.ok) throw new Error(body?.message ?? 'Could not save task prerequisites.'); await reload(); } catch (reason) { setErrorMessage(reason instanceof Error ? reason.message : 'Could not save task prerequisites.'); } finally { setBusy(false); } }
  if (loading) return <TaskDetailLoading />;
  if (error || !task) return <div className="workspace-section-page task-detail"><TaskDetailError message={error || errorMessage || 'Task unavailable.'} /><Link href="/workspace/tasks">Back to My Tasks</Link></div>;
  return <TaskDetailView task={task} currentUserId={user.id} members={members} projectTasks={projectTasks} busy={busy} errorMessage={errorMessage} onUpdate={(fields) => void updateTask(fields)} onDuplicate={() => void duplicateTask()} onDelete={() => void deleteTask()} onSaveDependencies={(ids) => void saveDependencies(ids)} />;
}
