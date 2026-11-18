'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState } from 'react';
import { useWorkspaceSession } from '../../../workspace-shell';
import type { WorkspaceMember } from '../types';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
export function useTaskMembers() {
  const { getToken } = useAuth(); const { workspace } = useWorkspaceSession();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    const token = await getToken(); if (!token || !apiBase) throw new Error('Could not connect to the workspace API.');
    const response = await fetch(`${apiBase}/workspaces/${workspace.id}/members`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Could not load workspace members.');
    setMembers(await response.json() as WorkspaceMember[]);
  }, [getToken, workspace.id]);
  useEffect(() => { void reload().catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load workspace members.')); }, [reload]);
  return { members, error };
}
