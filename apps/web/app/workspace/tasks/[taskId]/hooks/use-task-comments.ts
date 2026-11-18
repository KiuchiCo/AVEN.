'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTaskCollaborationApi } from '../api';
import type { TaskComment } from '../types';

export function useTaskComments(taskId: string) {
  const request = useTaskCollaborationApi(taskId);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(async () => setComments(await request<TaskComment[]>('/comments')), [request]);
  useEffect(() => { let live = true; void reload().catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : 'Could not load comments.'); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [reload]);
  const run = useCallback(async (operation: () => Promise<unknown>) => { setBusy(true); setError(''); try { await operation(); await reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this comment.'); } finally { setBusy(false); } }, [reload]);
  const add = useCallback((body: string, mentionedUserIds: string[]) => run(() => request('/comments', { method: 'POST', body: JSON.stringify({ body, mentionedUserIds }) })), [request, run]);
  const edit = useCallback((comment: TaskComment, body: string, mentionedUserIds: string[]) => run(() => request(`/comments/${comment.id}`, { method: 'PATCH', body: JSON.stringify({ body, mentionedUserIds }) })), [request, run]);
  const remove = useCallback((commentId: string) => run(() => request(`/comments/${commentId}`, { method: 'DELETE' })), [request, run]);
  return { comments, loading, busy, error, add, edit, remove };
}
