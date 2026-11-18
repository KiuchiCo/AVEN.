'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTaskCollaborationApi } from '../api';
import type { TaskFollower } from '../types';

export function useTaskFollowers(taskId: string, currentUserId: string) {
  const request = useTaskCollaborationApi(taskId);
  const [followers, setFollowers] = useState<TaskFollower[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(async () => setFollowers(await request<TaskFollower[]>('/watchers')), [request]);
  useEffect(() => { let live = true; void reload().catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : 'Could not load watchers.'); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [reload]);
  const following = followers.some((follower) => follower.id === currentUserId);
  const toggle = useCallback(async () => { setBusy(true); setError(''); try { await request('/watching', { method: 'PUT', body: JSON.stringify({ following: !following }) }); await reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update task following.'); } finally { setBusy(false); } }, [following, reload, request]);
  return { followers, following, loading, busy, error, toggle };
}
