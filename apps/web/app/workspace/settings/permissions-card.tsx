'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../i18n';
import type { Key as TKey } from '../../i18n/en';
import { useWorkspaceSession } from '../workspace-shell';
import { connectionError, apiFetch } from '../connection-error';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const keys = ['projects', 'automations', 'sharing'] as const;
type PolicyKey = (typeof keys)[number];
type Level = 'MEMBERS' | 'MANAGERS' | 'ADMINS';
type Policy = Record<PolicyKey, Level>;
type State = { available: boolean; policy: Policy; enforced: Policy };

const rows: Record<PolicyKey, { title: TKey; hint: TKey }> = {
  projects: { title: 'set.perm.projects', hint: 'set.perm.projectsHint' },
  automations: { title: 'set.perm.automations', hint: 'set.perm.automationsHint' },
  sharing: { title: 'set.perm.sharing', hint: 'set.perm.sharingHint' },
};
const levels: { value: Level; label: TKey }[] = [{ value: 'MEMBERS', label: 'set.perm.members' }, { value: 'MANAGERS', label: 'set.perm.managers' }, { value: 'ADMINS', label: 'set.perm.admins' }];

/** Which role is needed for a few sensitive actions. Business and Enterprise only. */
export function PermissionsCard() {
  const t = useT();
  const { workspace } = useWorkspaceSession();
  const { getToken } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState('');
  const canEdit = workspace.role === 'OWNER' || workspace.role === 'ADMINISTRATOR';

  const call = useCallback(async (method: 'GET' | 'PUT', body?: Partial<Policy>): Promise<State> => {
    const token = await getToken();
    if (!token || !apiBase) throw connectionError(token);
    const response = await apiFetch(`${apiBase}/workspaces/${workspace.id}/billing/permissions`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(json?.message ?? 'AVEN could not complete that request.');
    return json as State;
  }, [getToken, workspace.id]);

  useEffect(() => { void call('GET').then(setState).catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load permissions.')); }, [call]);

  async function change(key: PolicyKey, value: Level) {
    setMessage('');
    try { setState(await call('PUT', { [key]: value })); setMessage(t('set.perm.saved')); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save.'); }
  }

  if (!state) return <div className="workspace-settings-card"><div><h2>{t('set.perm.title')}</h2><p>{message || t('set.push.checking')}</p></div></div>;
  return <div className="workspace-settings-card">
    <div><h2>{t('set.perm.title')}</h2><p>{t('set.perm.hint')}</p></div>
    {!state.available && <p className="workspace-settings-note">{t('set.perm.notAvailable')}{Object.values(state.policy).some((level) => level !== 'MEMBERS') ? t('set.perm.kept') : ''}</p>}
    <div className="permission-rows">{keys.map((key) => <label key={key} className="permission-row">
      <span><strong>{t(rows[key].title)}</strong><small>{t(rows[key].hint)}</small></span>
      <select value={state.policy[key]} disabled={!state.available || !canEdit} onChange={(event) => void change(key, event.target.value as Level)} aria-label={t(rows[key].title)}>{levels.map((level) => <option key={level.value} value={level.value}>{t(level.label)}</option>)}</select>
    </label>)}</div>
    {state.available && !canEdit && <p className="workspace-settings-note">{t('set.perm.adminsOnly')}</p>}
    {message && <p className="workspace-settings-status" role="status">{message}</p>}
  </div>;
}
