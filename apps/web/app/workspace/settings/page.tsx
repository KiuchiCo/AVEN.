'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { BillingCard } from './billing-card';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

type Profile = { displayName: string; email: string; notifyTeamActivity: boolean; notifyTaskUpdates: boolean; emailNotifications: boolean; emailAvailable: boolean };

function AccountSettings() {
  const { getToken } = useAuth();
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
    void update({ displayName }, 'Your name was updated.', true);
  }

  if (!saved) return <div className="workspace-settings-card"><p role="status">{status || 'Loading your settings…'}</p></div>;

  return <>
    <div className="workspace-settings-card">
      <div><h2>Your profile</h2><p>Teammates see this name on comments, assignments and activity.</p></div>
      <form onSubmit={saveName}>
        <label htmlFor="display-name">Display name</label>
        <input id="display-name" maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
        <label htmlFor="account-email">Email</label>
        <input id="account-email" value={saved.email} disabled readOnly />
        <p className="workspace-settings-note">Your email comes from your sign-in account and can’t be changed here.</p>
        <button className="workspace-settings-save" disabled={busy || !displayName.trim() || displayName.trim() === saved.displayName}>{busy ? 'Saving…' : 'Save name'}</button>
      </form>
    </div>
    <div className="workspace-settings-card">
      <div><h2>Inbox notifications</h2><p>Choose what appears in your Inbox. Changes apply immediately and to every workspace you belong to.</p></div>
      <div className="workspace-settings-toggles">
        <label className="workspace-settings-toggle"><input type="checkbox" checked={saved.notifyTaskUpdates} disabled={busy} onChange={(event) => void update({ notifyTaskUpdates: event.target.checked }, 'Notification settings saved.')} /><span><strong>Mentions and task updates</strong><small>Comments, mentions, assignments and changes to tasks you follow.</small></span></label>
        <label className="workspace-settings-toggle"><input type="checkbox" checked={saved.notifyTeamActivity} disabled={busy} onChange={(event) => void update({ notifyTeamActivity: event.target.checked }, 'Notification settings saved.')} /><span><strong>Team activity</strong><small>Workspace-wide changes to projects, documents, calendar and members.</small></span></label>
        <label className="workspace-settings-toggle"><input type="checkbox" checked={saved.emailNotifications} disabled={busy || !saved.emailAvailable} onChange={(event) => void update({ emailNotifications: event.target.checked }, event.target.checked ? 'You’ll get a summary email a few minutes after new mentions and task updates, if you haven’t read them by then.' : 'Email notifications are off.')} /><span><strong>Email me a summary</strong><small>{saved.emailAvailable ? 'A short email when you have unread mentions, assignments or changes to tasks you follow. Only new notifications from now on are sent, and anything you read first is left out.' : 'Email isn’t set up for this AVEN installation yet. An administrator can add an email provider to turn this on.'}</small></span></label>
      </div>
      {status && <p className="workspace-settings-status" role="status">{status}</p>}
    </div>
  </>;
}

export default function WorkspaceSettingsPage() {
  const session = useWorkspaceSession();
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
    <header><p className="workspace-page-eyebrow">SETTINGS</p><h1>Settings</h1><p>Manage your profile, notifications and this workspace.</p></header>
    <AccountSettings />
    <BillingCard />
    <div className="workspace-settings-card">
      <div><h2>Workspace details</h2><p>Members will see this name in their workspace switcher.</p></div>
      <form onSubmit={save}>
        <label htmlFor="workspace-name">Workspace name</label>
        <input id="workspace-name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={session.workspace.role !== 'OWNER'} required />
        {session.workspace.role === 'OWNER' ? <button className="workspace-settings-save" disabled={busy || !name.trim() || name === session.workspace.name}>{busy ? 'Saving…' : 'Save changes'}</button> : <p className="workspace-settings-note">Only a workspace owner can change these settings.</p>}
        {status && <p className="workspace-settings-status" role="status">{status}</p>}
      </form>
      <dl><div><dt>Your role</dt><dd>{session.workspace.role?.toLowerCase() ?? 'member'}</dd></div><div><dt>Members</dt><dd>{session.workspace.memberCount ?? 1}</dd></div><div><dt>Workspace type</dt><dd>{session.workspace.isPersonal ? 'Personal' : 'Shared'}</dd></div></dl>
    </div>
  </section>;
}
