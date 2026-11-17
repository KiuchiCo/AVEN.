'use client';

import { useAuth } from '@clerk/nextjs';
import { useState, type FormEvent } from 'react';
import { useWorkspaceSession } from '../workspace-shell';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

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
    <header><p className="workspace-page-eyebrow">WORKSPACE</p><h1>Settings</h1><p>Manage the name and details for this workspace.</p></header>
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
