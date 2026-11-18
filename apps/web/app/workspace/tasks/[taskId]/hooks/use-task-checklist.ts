'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTaskCollaborationApi } from '../api';
import type { ChecklistItem } from '../types';
import { notifyTaskActivityChanged } from '../lib/task-activity-events';

export function useTaskChecklist(taskId: string) {
  const request = useTaskCollaborationApi(taskId);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(async () => setItems(await request<ChecklistItem[]>('/checklist')), [request]);
  useEffect(() => { let live = true; async function load() { try { const saved = await request<ChecklistItem[]>('/checklist'); if (live) setItems(saved); } catch (reason) { if (live) setError(reason instanceof Error ? reason.message : 'Could not load the checklist.'); } finally { if (live) setLoading(false); } } void load(); return () => { live = false; }; }, [request]);
  const run = useCallback(async (operation: () => Promise<unknown>) => { setBusy(true); setError(''); try { await operation(); notifyTaskActivityChanged(taskId); await reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the checklist.'); } finally { setBusy(false); } }, [reload, taskId]);
  const add = useCallback((title: string) => run(() => request('/checklist', { method: 'POST', body: JSON.stringify({ title }) })), [request, run]);
  const toggle = useCallback((item: ChecklistItem) => run(() => request(`/checklist/${item.id}`, { method: 'PATCH', body: JSON.stringify({ completed: !item.completedAt }) })), [request, run]);
  const rename = useCallback((itemId: string, title: string) => run(() => request(`/checklist/${itemId}`, { method: 'PATCH', body: JSON.stringify({ title }) })), [request, run]);
  const remove = useCallback((itemId: string) => run(() => request(`/checklist/${itemId}`, { method: 'DELETE' })), [request, run]);
  const move = useCallback((itemId: string, direction: 'UP' | 'DOWN') => run(() => request(`/checklist/${itemId}/move`, { method: 'POST', body: JSON.stringify({ direction }) })), [request, run]);
  return { items, loading, busy, error, add, toggle, rename, remove, move };
}
