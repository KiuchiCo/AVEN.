'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import { useWorkspaceSession } from '../workspace-shell';

type Member = { userId: string; displayName: string; email: string; role: string; createdAt: string };
type Invitation = { id: string; email: string; role: string; expiresAt: string; createdAt: string };
type WorkspaceData = { members: Member[]; invitations: Invitation[] };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const roleKeys = { OWNER: 'role.owner', ADMINISTRATOR: 'role.administrator', MANAGER: 'role.manager', MEMBER: 'role.member', GUEST: 'role.guest' } as const;

export function WorkspaceMembers() {
  const { getToken } = useAuth();
  const t = useT();
  const router = useRouter();
  const roleLabel = (value: string) => (value in roleKeys ? t(roleKeys[value as keyof typeof roleKeys]) : value);
  const { user, workspace } = useWorkspaceSession();
  const [data, setData] = useState<WorkspaceData>({ members: [], invitations: [] });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [inviteLink, setInviteLink] = useState('');
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [emailOutcome, setEmailOutcome] = useState<'sent' | 'failed' | 'not_configured'>('not_configured');
  const [copied, setCopied] = useState(false);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canInvite = ['OWNER', 'ADMINISTRATOR'].includes(workspace.role ?? '');
  const isOwner = workspace.role === 'OWNER';
  const canManageMembers = isOwner || workspace.role === 'ADMINISTRATOR';

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
    try {
      const next = await request(`/workspaces/${workspace.id}/members/management`) as WorkspaceData;
      setData(next);
      setRoleDrafts(Object.fromEntries(next.members.map((member) => [member.userId, member.role])));
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load workspace people.'); }
    finally { setLoading(false); }
  }, [request, workspace.id]);

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const next = await request(`/workspaces/${workspace.id}/members/management`) as WorkspaceData;
        if (!live) return;
        setData(next);
        setRoleDrafts(Object.fromEntries(next.members.map((member) => [member.userId, member.role])));
      } catch (reason) { if (live) setError(reason instanceof Error ? reason.message : 'Could not load workspace people.'); }
      finally { if (live) setLoading(false); }
    }
    void load();
    return () => { live = false; };
  }, [request, workspace.id]);

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setInviteLink('');
    try {
      const invitedEmail = email;
      const result = await request(`/workspaces/${workspace.id}/members/invitations`, { method: 'POST', body: JSON.stringify({ email, role }) }) as { token: string; email?: 'sent' | 'failed' | 'not_configured' };
      setEmailOutcome(result.email ?? 'not_configured');
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

  async function updateRole(member: Member) {
    const role = roleDrafts[member.userId] ?? member.role;
    if (role === member.role) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/workspaces/${workspace.id}/members/${member.userId}`, { method: 'PATCH', body: JSON.stringify({ role }) });
      setNotice(t('mem.roleUpdated', { name: member.displayName, role: roleLabel(role) }));
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this member role.'); }
    finally { setBusy(false); }
  }

  async function makeOwner(member: Member) {
    if (!window.confirm(t('mem.makeOwnerConfirm', { name: member.displayName, workspace: workspace.name }))) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/workspaces/${workspace.id}/members/${member.userId}/make-owner`, { method: 'POST' });
      setNotice(t('mem.ownerMade', { name: member.displayName }));
      window.location.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not transfer ownership.'); setBusy(false); }
  }

  async function leaveWorkspace() {
    if (!window.confirm(t('mem.leaveConfirm', { workspace: workspace.name }))) return;
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/members/leave`, { method: 'POST' });
      await fetch('/api/active-workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      router.push('/workspace'); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not leave this workspace.'); setBusy(false); }
  }

  async function removeMember(member: Member) {
    if (!window.confirm(t('mem.removeConfirm', { name: member.displayName, workspace: workspace.name }))) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/workspaces/${workspace.id}/members/${member.userId}`, { method: 'DELETE' });
      setNotice(t('mem.removed', { name: member.displayName }));
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not remove this member.'); }
    finally { setBusy(false); }
  }

  return <div className="workspace-section-page members-page">
    <p className="workspace-eyebrow">{t('act.eyebrow', { name: workspace.name })}</p>
    <h1>{t('nav.people')}</h1>
    <p className="workspace-section-page__description">{t('mem.desc')}</p>
    {!isOwner && <p className="members-leave"><span>{t('mem.leaveNote')}</span> <button type="button" disabled={busy} onClick={() => void leaveWorkspace()}>{t('mem.leave')}</button></p>}
    {error && <p className="productivity-error" role="alert">{error}</p>}
    {notice && <p className="members-notice" role="status">{notice}</p>}
    <div className="members-layout">
      <section className="members-panel" aria-labelledby="members-list-title">
        <header><div><p className="workspace-eyebrow">{t('mem.team')}</p><h2 id="members-list-title">{t('mem.members')} <span>{data.members.length}</span></h2></div></header>
        {loading ? <p className="productivity-message">{t('mem.loading')}</p> : <ul className="members-list">{data.members.map((member) => {
          const isSelf = member.userId === user.id;
          const currentRole = roleDrafts[member.userId] ?? member.role;
          return <li key={member.userId}><span className="members-avatar" aria-hidden="true">{member.displayName.trim().slice(0, 1).toUpperCase()}</span><div><strong>{member.displayName}{isSelf ? t('mem.you') : ''}</strong><small>{member.email}</small></div>
            {canManageMembers && !isSelf && member.role !== 'OWNER' && (isOwner || member.role !== 'ADMINISTRATOR') ? <div className="members-row-actions"><select aria-label={t('mem.roleFor', { name: member.displayName })} value={currentRole} onChange={(event) => setRoleDrafts((current) => ({ ...current, [member.userId]: event.target.value }))}>{isOwner && <option value="ADMINISTRATOR">{t('role.administrator')}</option>}<option value="MANAGER">{t('role.manager')}</option><option value="MEMBER">{t('role.member')}</option><option value="GUEST">{t('role.guest')}</option></select><button type="button" disabled={busy || currentRole === member.role} onClick={() => void updateRole(member)}>{t('mem.save')}</button>{isOwner && !workspace.isPersonal && member.role !== 'GUEST' && <button type="button" disabled={busy} onClick={() => void makeOwner(member)}>{t('mem.makeOwner')}</button>}<button type="button" className="members-revoke" disabled={busy} onClick={() => void removeMember(member)}>{t('mem.remove')}</button></div> : <span className="members-role">{roleLabel(member.role)}</span>}
          </li>;
        })}</ul>}
      </section>

      <section className="members-panel members-invite-panel" aria-labelledby="invite-title">
        <header><div><p className="workspace-eyebrow">{t('mem.grow')}</p><h2 id="invite-title">{t('mem.invite')}</h2></div><span aria-hidden="true">＋</span></header>
        {canInvite ? <>
          <form className="members-invite-form" onSubmit={(event) => void createInvite(event)}>
            <label>{t('mem.email')}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={320} placeholder="teammate@example.com" /></label>
            <label>{t('mem.workspaceRole')}<select value={role} onChange={(event) => setRole(event.target.value)}><option value="ADMINISTRATOR">{t('role.administrator')}</option><option value="MANAGER">{t('role.manager')}</option><option value="MEMBER">{t('role.member')}</option><option value="GUEST">{t('role.guest')}</option></select></label>
            <small>{t('mem.expiry')}</small>
            <button type="submit" disabled={busy || loading}>{busy ? t('mem.creating') : t('mem.create')}</button>
          </form>
          {inviteLink && <div className="members-invite-link" role="status"><strong>{t('mem.ready')}</strong><p>{emailOutcome === 'sent' ? t('mem.sent', { email: inviteeEmail }) : emailOutcome === 'failed' ? t('mem.failed', { email: inviteeEmail }) : t('mem.notSent', { email: inviteeEmail })} {t('mem.shownOnce')}</p><code>{inviteLink}</code><button type="button" onClick={() => void copyInvite()}>{copied ? t('mem.copied') : t('mem.copy')}</button></div>}
        </> : <p className="members-permission-note">{t('mem.onlyAdmins')}</p>}
      </section>

      <section className="members-panel members-pending-panel" aria-labelledby="pending-title"><header><div><p className="workspace-eyebrow">{t('mem.awaiting')}</p><h2 id="pending-title">{t('mem.pending')} <span>{data.invitations.length}</span></h2></div></header>
        {loading ? <p className="productivity-message">{t('mem.loadingInv')}</p> : data.invitations.length ? <ul className="members-list">{data.invitations.map((invite) => <li key={invite.id}><span className="members-avatar is-pending" aria-hidden="true">✉</span><div><strong>{invite.email}</strong><small>{t('mem.expires', { role: roleLabel(invite.role), date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(invite.expiresAt)) })}</small></div>{canInvite && <button type="button" className="members-revoke" disabled={busy} onClick={() => void revokeInvite(invite.id)}>{t('mem.revoke')}</button>}</li>)}</ul> : <p className="members-empty">{t('mem.noPending')}</p>}
      </section>
    </div>
  </div>;
}
