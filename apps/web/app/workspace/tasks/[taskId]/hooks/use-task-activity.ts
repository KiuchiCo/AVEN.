'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTaskCollaborationApi } from '../api';
import type { TaskActivityEntry } from '../types';
import { listenForTaskActivity } from '../lib/task-activity-events';

export function useTaskActivity(taskId: string) {
  const request = useTaskCollaborationApi(taskId);
  const [entries, setEntries] = useState<TaskActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    setError('');
    setEntries(await request<TaskActivityEntry[]>('/activity'));
  }, [request]);
  useEffect(() => {
    let live = true;
    const reportError = (reason: unknown) => { if (live) setError(reason instanceof Error ? reason.message : 'Could not load task activity.'); };
    void reload().catch(reportError).finally(() => { if (live) setLoading(false); });
    const unsubscribe = listenForTaskActivity(taskId, () => { void reload().catch(reportError); });
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void reload().catch(reportError); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => { live = false; unsubscribe(); document.removeEventListener('visibilitychange', onVisibilityChange); };
  }, [reload, taskId]);
  return { entries, loading, error, reload };
}
