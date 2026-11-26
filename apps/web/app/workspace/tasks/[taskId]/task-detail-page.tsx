'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useWorkspaceSession } from '../../workspace-shell';
import { useT } from '../../../i18n';
import { baseFor } from '../../task-offline';
import type { TaskSummary } from './types';
import { useTaskSync } from '../../task-sync';
import { TaskDetailError } from './components/task-detail-error';
import { TaskDetailLoading } from './components/task-detail-loading';
import { TaskDetailView } from './components/task-detail-view';
import { useTaskDetail } from './hooks/use-task-detail';
import { useTaskMembers } from './hooks/use-task-members';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>(); const router = useRouter(); const { getToken } = useAuth(); const { workspace, user } = useWorkspaceSession(); const t = useT();
  const { members } = useTaskMembers(); const { task, loading, error, reload, patchLocal } = useTaskDetail(taskId); const taskSync = useTaskSync(); const handledSync = useRef(0); const [errorMessage, setErrorMessage] = useState(''); const [busy, setBusy] = useState(false); const [projectTasks, setProjectTasks] = useState<{ id: string; title: string; status: string; project: { id: string; name: string } | null }[]>([]);
  useEffect(() => {
    if (!task?.project) return;
    let live = true;
    async function loadProjectTasks() {
      try {
        const token = await getToken();
        if (!token || !apiBase) return;
        const response = await fetch(`${apiBase}/workspaces/${workspace.id}/tasks`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error(t('td.err.loadProject'));
        const rows = await response.json();
        if (live) setProjectTasks(rows);
      } catch (reason) { if (live) setErrorMessage(reason instanceof Error ? reason.message : t('td.err.loadProject')); }
    }
    void loadProjectTasks();
    return () => { live = false; };
  }, [getToken, task?.id, task?.project, workspace.id, t]);
  async function send(method: 'POST' | 'PATCH', path: string, body: Record<string, unknown>, fallback: string): Promise<boolean> {
    const token = await getToken(); if (!token || !apiBase) return false;
    setBusy(true); setErrorMessage('');
    try {
      const response = await fetch(`${apiBase}/workspaces/${workspace.id}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      if (!response.ok) { const problem = await response.json().catch(() => null) as { message?: string } | null; throw new Error(problem?.message ?? fallback); }
      await reload();
      return true;
    } catch (reason) { setErrorMessage(reason instanceof Error ? reason.message : fallback); return false; }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (taskSync.syncVersion === handledSync.current) return;
    handledSync.current = taskSync.syncVersion;
    void reload().catch(() => undefined);
  }, [reload, taskSync.syncVersion]);
  async function updateTask(fields: Record<string, string | number | null>): Promise<boolean> {
    if (!task) return false;
    setBusy(true); setErrorMessage('');
    try {
      const outcome = await taskSync.change(taskId, task.title, fields, baseFor(task, fields));
      if (outcome === 'saved') await reload();
      else {
        const assignee = 'assigneeId' in fields ? members.find((member) => member.userId === fields.assigneeId) : undefined;
        patchLocal({ ...fields, ...('assigneeId' in fields ? { assignee: assignee ? { id: assignee.userId, displayName: assignee.displayName } : null } : {}) } as unknown as Partial<TaskSummary>);
      }
      return true;
    } catch (reason) { setErrorMessage(reason instanceof Error ? reason.message : t('td.err.update')); return false; }
    finally { setBusy(false); }
  }
  const addSubtask = (title: string) => send('POST', '/tasks', { title, parentId: taskId }, t('td.err.addSubtask'));
  const toggleSubtask = (subtaskId: string, completed: boolean) => { void send('PATCH', `/tasks/${subtaskId}`, { status: completed ? 'COMPLETED' : 'TODO' }, t('td.err.updateSubtask')); };
  async function duplicateTask() { const token = await getToken(); if (!token || !apiBase) return; setBusy(true); setErrorMessage(''); try { const response = await fetch(`${apiBase}/workspaces/${workspace.id}/tasks/${taskId}/duplicate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); const body = await response.json().catch(() => null) as { id?: string; message?: string } | null; if (!response.ok || !body?.id) throw new Error(body?.message ?? t('td.err.duplicate')); router.push(`/workspace/tasks/${body.id}`); } catch (reason) { setErrorMessage(reason instanceof Error ? reason.message : t('td.err.duplicate')); } finally { setBusy(false); } }
  async function deleteTask() { if (!window.confirm(t('td.deleteConfirm'))) return; const token = await getToken(); if (!token || !apiBase) return; setBusy(true); setErrorMessage(''); try { const response = await fetch(`${apiBase}/workspaces/${workspace.id}/tasks/${taskId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); const body = await response.json().catch(() => null) as { message?: string } | null; if (!response.ok) throw new Error(body?.message ?? t('td.err.delete')); router.push(task?.project ? `/workspace/projects/${task.project.id}` : '/workspace/tasks'); } catch (reason) { setErrorMessage(reason instanceof Error ? reason.message : t('td.err.delete')); } finally { setBusy(false); } }
  async function saveDependencies(ids: string[]) { const token = await getToken(); if (!token || !apiBase) return; setBusy(true); setErrorMessage(''); try { const response = await fetch(`${apiBase}/workspaces/${workspace.id}/tasks/${taskId}/dependencies`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ dependsOnTaskIds: ids }) }); const body = await response.json().catch(() => null) as { message?: string } | null; if (!response.ok) throw new Error(body?.message ?? t('td.err.prereqs')); await reload(); } catch (reason) { setErrorMessage(reason instanceof Error ? reason.message : t('td.err.prereqs')); } finally { setBusy(false); } }
  if (loading) return <TaskDetailLoading />;
  if (error || !task) return <div className="workspace-section-page task-detail"><TaskDetailError message={error || errorMessage || t('td.unavailable')} /><Link href="/workspace/tasks">{t('td.backToMy')}</Link></div>;
  return <TaskDetailView task={task} currentUserId={user.id} members={members} projectTasks={projectTasks} busy={busy} errorMessage={errorMessage} onUpdate={(fields) => void updateTask(fields)} onAddSubtask={addSubtask} onToggleSubtask={toggleSubtask} onDuplicate={() => void duplicateTask()} onDelete={() => void deleteTask()} onSaveDependencies={(ids) => void saveDependencies(ids)} />;
}
