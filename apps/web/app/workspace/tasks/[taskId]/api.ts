'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback } from 'react';
import { useWorkspaceSession } from '../../workspace-shell';
import { connectionError } from '../../connection-error';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

export function useTaskCollaborationApi(taskId: string) {
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const request = useCallback(async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const token = await getToken();
    if (!token || !apiBase) throw connectionError(token);
    const response = await fetch(`${apiBase}/workspaces/${workspace.id}/tasks/${taskId}/collaboration${path}`, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(body?.message ?? 'AVEN could not complete that request.');
    }
    return response.json() as Promise<T>;
  }, [getToken, taskId, workspace.id]);
  return request;
}
