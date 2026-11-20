'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import { useWorkspaceSession } from '../workspace-shell';
import { BillingCard } from './billing-card';
import { DeleteWorkspaceCard } from './delete-workspace-card';
import { LanguageCard } from './language-card';
import { PermissionsCard } from './permissions-card';
import { PushCard } from './push-card';
import { ThemeCard } from './theme-card';
import { TimeZoneCard } from './time-zone-card';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

type Profile = { displayName: string; email: string; notifyTeamActivity: boolean; notifyTaskUpdates: boolean; emailNotifications: boolean; emailAvailable: boolean };

function AccountSettings() {
  const { getToken } = useAuth();
  const t = useT();
  const [saved, setSaved] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function request(method: 'GET' | 'PATCH', body?: Partial<Profile>) {
    const token = await getToken();
    const response = await fetch(`${apiBase}/session/me`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message ?? 'Could not update your settings.');
    return result as Profile;
  }

  useEffect(() => {
    let cancelled = false;
    request('GET').then((profile) => { if (!cancelled) { setSaved(profile); setDisplayName(profile.displayName); } })
      .catch((error) => { if (!cancelled) setStatus(error instanceof Error ? error.message : 'Could not load your settings.'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function update(change: Partial<Profile>, message: string, reload = false) {
    setBusy(true); setStatus('');
    try {
      const profile = await request('PATCH', change);
      setSaved(profile); setDisplayName(profile.displayName); setStatus(message);
      if (reload) window.location.reload();
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not update your settings.'); }
    finally { setBusy(false); }
  }

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void update({ displayName }, t('set.profile.saved'), true);
  }

  if (!saved) return <div className="workspace-settings-card"><p role="status">{status || t('set.loading')}</p></div>;

  return <>
    <div className="workspace-settings-card">
      <div><h2>{t('set.profile.title')}</h2><p>{t('set.profile.hint')}</p></div>
      <form onSubmit={saveName}>
        <label htmlFor="display-name">{t('set.profile.name')}</label>
        <input id="display-name" maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
        <label htmlFor="account-email">{t('set.profile.email')}</label>
        <input id="account-email" value={saved.email} disabled readOnly />
        <p className="workspace-settings-note">{t('set.profile.emailNote')}</p>
        <button className="workspace-settings-save" disabled={busy || !displayName.trim() || displayName.trim() === saved.displayName}>{busy ? t('set.saving') : t('set.profile.save')}</button>
      </form>
    </div>
    <div className="workspace-settings-card">
      <div><h2>{t('set.notif.title')}</h2><p>{t('set.notif.hint')}</p></div>
      <div className="workspace-settings-toggles">
        <label className="workspace-settings-toggle"><input type="checkbox" checked={saved.notifyTaskUpdates} disabled={busy} onChange={(event) => void update({ notifyTaskUpdates: event.target.checked }, t('set.notif.saved'))} /><span><strong>{t('set.notif.tasks')}</strong><small>{t('set.notif.tasksHint')}</small></span></label>
        <label className="workspace-settings-toggle"><input type="checkbox" checked={saved.notifyTeamActivity} disabled={busy} onChange={(event) => void update({ notifyTeamActivity: event.target.checked }, t('set.notif.saved'))} /><span><strong>{t('set.notif.team')}</strong><small>{t('set.notif.teamHint')}</small></span></label>
        <label className="workspace-settings-toggle"><input type="checkbox" checked={saved.emailNotifications} disabled={busy || !saved.emailAvailable} onChange={(event) => void update({ emailNotifications: event.target.checked }, event.target.checked ? t('set.notif.emailOnSaved') : t('set.notif.emailOffSaved'))} /><span><strong>{t('set.notif.email')}</strong><small>{saved.emailAvailable ? t('set.notif.emailHint') : t('set.notif.emailOff')}</small></span></label>
      </div>
      {status && <p className="workspace-settings-status" role="status">{status}</p>}
    </div>
  </>;
}

export default function WorkspaceSettingsPage() {
  const session = useWorkspaceSession();
  const t = useT();
  const { getToken } = useAuth();
  const [name, setName] = useState(session.workspace.name);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus('');
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/session/workspaces/${session.workspace.id}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message ?? 'Could not save workspace settings.');
      setStatus('Workspace name updated.'); window.location.reload();
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save workspace settings.'); }
    finally { setBusy(false); }
  }

  return <section className="workspace-settings-page">
    <header><p className="workspace-page-eyebrow">{t('set.eyebrow')}</p><h1>{t('set.title')}</h1><p>{t('set.sub')}</p></header>
    <AccountSettings />
    <ThemeCard />
    <LanguageCard />
    <TimeZoneCard />
    <PushCard />
    <BillingCard />
    <PermissionsCard />
    <div className="workspace-settings-card">
      <div><h2>{t('set.ws.title')}</h2><p>{t('set.ws.hint')}</p></div>
      <form onSubmit={save}>
        <label htmlFor="workspace-name">{t('set.ws.name')}</label>
        <input id="workspace-name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={session.workspace.role !== 'OWNER'} required />
        {session.workspace.role === 'OWNER' ? <button className="workspace-settings-save" disabled={busy || !name.trim() || name === session.workspace.name}>{busy ? t('set.saving') : t('set.ws.save')}</button> : <p className="workspace-settings-note">{t('set.ws.ownerOnly')}</p>}
        {status && <p className="workspace-settings-status" role="status">{status}</p>}
      </form>
      <dl><div><dt>{t('set.ws.role')}</dt><dd>{session.workspace.role?.toLowerCase() ?? 'member'}</dd></div><div><dt>{t('set.ws.members')}</dt><dd>{session.workspace.memberCount ?? 1}</dd></div><div><dt>{t('set.ws.type')}</dt><dd>{session.workspace.isPersonal ? t('set.ws.personal') : t('set.ws.shared')}</dd></div></dl>
    </div>
    <DeleteWorkspaceCard />
  </section>;
}
