'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { useWorkspaceSession } from '../../../workspace-shell';
import type { WorkspaceMember } from '../types';
import { connectionError, apiFetch } from '../../../connection-error';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
export function useTaskMembers() {
  const { getToken } = useAuth(); const { workspace } = useWorkspaceSession();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    async function load() {
      try { const token = await getToken(); if (!token || !apiBase) throw connectionError(token); const response = await apiFetch(`${apiBase}/workspaces/${workspace.id}/members`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error('Could not load workspace members.'); const savedMembers = await response.json() as WorkspaceMember[]; if (live) setMembers(savedMembers); }
      catch (reason) { if (live) setError(reason instanceof Error ? reason.message : 'Could not load workspace members.'); }
    }
    void load();
    return () => { live = false; };
  }, [getToken, workspace.id]);
  return { members, error };
}
