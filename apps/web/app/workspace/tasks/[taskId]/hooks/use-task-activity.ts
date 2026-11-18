'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTaskCollaborationApi } from '../api';
import type { TaskActivityEntry } from '../types';

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
    void reload().catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : 'Could not load task activity.'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [reload]);
  return { entries, loading, error, reload };
}
