'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { connectionError } from '../connection-error';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
export type Request = <T = unknown>(path: string, options?: RequestInit) => Promise<T>;

/** One authenticated request helper for the whole Projects module. Paths start after `/workspaces/{id}`. */
export function useProjectApi() {
  const { getToken } = useAuth();
  const { workspace, user } = useWorkspaceSession();
  const request = useCallback<Request>(async (path, options = {}) => {
    const token = await getToken();
    if (!token || !apiBase) throw connectionError(token);
    const response = await fetch(`${apiBase}/workspaces/${workspace.id}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(body?.message ?? 'AVEN could not save that change. Please try again.');
    }
    return (response.status === 204 ? null : await response.json()) as never;
  }, [getToken, workspace.id]);
  return { request, workspace, user };
}

export const messageOf = (reason: unknown, fallback: string) => (reason instanceof Error ? reason.message : fallback);
