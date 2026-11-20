'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState } from 'react';
import { useWorkspaceSession } from '../workspace-shell';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const keys = ['projects', 'automations', 'sharing'] as const;
type Key = (typeof keys)[number];
type Level = 'MEMBERS' | 'MANAGERS' | 'ADMINS';
type Policy = Record<Key, Level>;
type State = { available: boolean; policy: Policy; enforced: Policy };

const rows: Record<Key, { title: string; hint: string }> = {
  projects: { title: 'Creating projects', hint: 'Also covers starting a project from a template.' },
  automations: { title: 'Automations and workflows', hint: 'Creating, editing, pausing and deleting them.' },
  sharing: { title: 'Public share links', hint: 'Creating a read-only link to a document.' },
};
const levels: { value: Level; label: string }[] = [{ value: 'MEMBERS', label: 'Any member' }, { value: 'MANAGERS', label: 'Managers and above' }, { value: 'ADMINS', label: 'Administrators and owners' }];

/** Which role is needed for a few sensitive actions. Business and Enterprise only. */
export function PermissionsCard() {
  const { workspace } = useWorkspaceSession();
  const { getToken } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState('');
  const canEdit = workspace.role === 'OWNER' || workspace.role === 'ADMINISTRATOR';

  const call = useCallback(async (method: 'GET' | 'PUT', body?: Partial<Policy>): Promise<State> => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API.');
    const response = await fetch(`${apiBase}/workspaces/${workspace.id}/billing/permissions`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(json?.message ?? 'AVEN could not complete that request.');
    return json as State;
  }, [getToken, workspace.id]);

  useEffect(() => { void call('GET').then(setState).catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load permissions.')); }, [call]);

  async function change(key: Key, value: Level) {
    setMessage('');
    try { setState(await call('PUT', { [key]: value })); setMessage('Saved.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save.'); }
  }

  if (!state) return <div className="workspace-settings-card"><div><h2>Role permissions</h2><p>{message || 'Loading…'}</p></div></div>;
  return <div className="workspace-settings-card">
    <div><h2>Role permissions</h2><p>Choose who can do a few sensitive things. Guests can never make changes.</p></div>
    {!state.available && <p className="workspace-settings-note">Role permissions are part of the Business plan. Until then everyone with write access can do all of these.{state.policy && Object.values(state.policy).some((level) => level !== 'MEMBERS') ? ' Your saved choices are kept and apply again if you upgrade.' : ''}</p>}
    <div className="permission-rows">{keys.map((key) => <label key={key} className="permission-row">
      <span><strong>{rows[key].title}</strong><small>{rows[key].hint}</small></span>
      <select value={state.policy[key]} disabled={!state.available || !canEdit} onChange={(event) => void change(key, event.target.value as Level)} aria-label={rows[key].title}>{levels.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}</select>
    </label>)}</div>
    {state.available && !canEdit && <p className="workspace-settings-note">Only owners and administrators can change these.</p>}
    {message && <p className="workspace-settings-status" role="status">{message}</p>}
  </div>;
}
