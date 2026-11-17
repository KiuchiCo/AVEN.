'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from '../workspace-shell';

type Member = { userId: string; displayName: string; email: string; role: string; createdAt: string };
type Invitation = { id: string; email: string; role: string; expiresAt: string; createdAt: string };
type WorkspaceData = { members: Member[]; invitations: Invitation[] };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const roleLabels: Record<string, string> = { OWNER: 'Owner', ADMINISTRATOR: 'Administrator', MANAGER: 'Manager', MEMBER: 'Member', GUEST: 'Guest' };

export function WorkspaceMembers() {
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [data, setData] = useState<WorkspaceData>({ members: [], invitations: [] });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [inviteLink, setInviteLink] = useState('');
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canInvite = ['OWNER', 'ADMINISTRATOR'].includes(workspace.role ?? '');

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to its API.');
    const response = await fetch(`${apiBase}${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...options.headers } });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(body?.message ?? 'AVEN could not complete this request.');
    }
    return response.json();
  }, [getToken]);

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await request(`/workspaces/${workspace.id}/members/management`) as WorkspaceData); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load workspace people.'); }
    finally { setLoading(false); }
  }, [request, workspace.id]);

  useEffect(() => { void reload(); }, [reload]);

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setInviteLink('');
    try {
      const invitedEmail = email;
      const result = await request(`/workspaces/${workspace.id}/members/invitations`, { method: 'POST', body: JSON.stringify({ email, role }) }) as { token: string };
      const link = `${window.location.origin}/invite?token=${encodeURIComponent(result.token)}`;
      setInviteLink(link); setEmail(''); setInviteeEmail(invitedEmail);
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create an invitation.'); }
    finally { setBusy(false); }
  }

  async function revokeInvite(id: string) {
    setBusy(true); setError('');
    try { await request(`/workspaces/${workspace.id}/members/invitations/${id}`, { method: 'DELETE' }); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not revoke this invitation.'); }
    finally { setBusy(false); }
  }

  async function copyInvite() {
    try { await navigator.clipboard.writeText(inviteLink); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError('Copy was blocked. Select and copy the invitation link below.'); }
  }

  return <div className="workspace-section-page members-page">
    <p className="workspace-eyebrow">YOUR WORKSPACE · {workspace.name}</p>
    <h1>People</h1>
    <p className="workspace-section-page__description">Invite teammates into this workspace and manage outstanding invitations.</p>
    {error && <p className="productivity-error" role="alert">{error}</p>}
    <div className="members-layout">
      <section className="members-panel" aria-labelledby="members-list-title">
        <header><div><p className="workspace-eyebrow">WORKSPACE TEAM</p><h2 id="members-list-title">Members <span>{data.members.length}</span></h2></div></header>
        {loading ? <p className="productivity-message">Loading people…</p> : <ul className="members-list">{data.members.map((member) => <li key={member.userId}><span className="members-avatar" aria-hidden="true">{member.displayName.trim().slice(0, 1).toUpperCase()}</span><div><strong>{member.displayName}</strong><small>{member.email}</small></div><span className="members-role">{roleLabels[member.role] ?? member.role}</span></li>)}</ul>}
      </section>

      <section className="members-panel members-invite-panel" aria-labelledby="invite-title">
        <header><div><p className="workspace-eyebrow">GROW YOUR TEAM</p><h2 id="invite-title">Invite someone</h2></div><span aria-hidden="true">＋</span></header>
        {canInvite ? <>
          <form className="members-invite-form" onSubmit={(event) => void createInvite(event)}>
            <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={320} placeholder="teammate@example.com" /></label>
            <label>Workspace role<select value={role} onChange={(event) => setRole(event.target.value)}><option value="ADMINISTRATOR">Administrator</option><option value="MANAGER">Manager</option><option value="MEMBER">Member</option><option value="GUEST">Guest</option></select></label>
            <small>Invite links expire after 7 days and can only be accepted by the invited email address.</small>
            <button type="submit" disabled={busy || loading}>{busy ? 'Creating…' : 'Create invitation link'}</button>
          </form>
          {inviteLink && <div className="members-invite-link" role="status"><strong>Invitation ready</strong><p>Share this link with {inviteeEmail}. It is shown once.</p><code>{inviteLink}</code><button type="button" onClick={() => void copyInvite()}>{copied ? 'Copied' : 'Copy link'}</button></div>}
        </> : <p className="members-permission-note">Only workspace owners and administrators can invite people.</p>}
      </section>

      <section className="members-panel members-pending-panel" aria-labelledby="pending-title"><header><div><p className="workspace-eyebrow">AWAITING ACCEPTANCE</p><h2 id="pending-title">Pending invitations <span>{data.invitations.length}</span></h2></div></header>
        {loading ? <p className="productivity-message">Loading invitations…</p> : data.invitations.length ? <ul className="members-list">{data.invitations.map((invite) => <li key={invite.id}><span className="members-avatar is-pending" aria-hidden="true">✉</span><div><strong>{invite.email}</strong><small>{roleLabels[invite.role] ?? invite.role} · expires {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(invite.expiresAt))}</small></div>{canInvite && <button type="button" className="members-revoke" disabled={busy} onClick={() => void revokeInvite(invite.id)}>Revoke</button>}</li>)}</ul> : <p className="members-empty">No pending invitations.</p>}
      </section>
    </div>
  </div>;
}
