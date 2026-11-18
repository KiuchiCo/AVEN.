'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTaskCollaborationApi } from '../api';
import type { TaskSummary } from '../types';

export function useTaskDetail(taskId: string) {
  const request = useTaskCollaborationApi(taskId);
  const [task, setTask] = useState<TaskSummary | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const reload = useCallback(async () => setTask(await request<TaskSummary>('/task')), [request]);
  useEffect(() => {
    let live = true;
    async function load() {
      try { const savedTask = await request<TaskSummary>('/task'); if (live) setTask(savedTask); }
      catch (reason) { if (live) setError(reason instanceof Error ? reason.message : 'Could not load this task.'); }
      finally { if (live) setLoading(false); }
    }
    void load();
    return () => { live = false; };
  }, [request]);
  return { task, loading, error, reload };
}
