'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import { useWorkspaceSession } from '../workspace-shell';
import { Avatar, EmptyState, PageHeader, Panel, Pill, PillTabs } from '../ui';
import { Icon } from '../home-icons';
import { connectionError } from '../connection-error';

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
  const [tab, setTab] = useState<'MEMBERS' | 'INVITATIONS'>('MEMBERS');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canInvite = ['OWNER', 'ADMINISTRATOR'].includes(workspace.role ?? '');
  const isOwner = workspace.role === 'OWNER';
  const canManageMembers = isOwner || workspace.role === 'ADMINISTRATOR';

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    if (!token || !apiBase) throw connectionError(token);
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

  const shownMembers = data.members.filter((member) => (roleFilter === 'ALL' || member.role === roleFilter) && (!query.trim() || `${member.displayName} ${member.email}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const date = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
  const tone = (value: string) => (value === 'OWNER' ? 'bronze' : value === 'ADMINISTRATOR' ? 'violet' : value === 'MANAGER' ? 'blue' : value === 'GUEST' ? 'amber' : 'neutral') as 'bronze' | 'violet' | 'blue' | 'amber' | 'neutral';
  const pendingPanel = <Panel icon="mail" title={<>{t('mem.pending')}</>} subtitle={t(data.invitations.length === 1 ? 'mem.countOne' : 'mem.countMany', { n: data.invitations.length }).replace(/member/i, 'invitation')} id="pending" className="members-pending-panel">
    {loading ? <p className="productivity-message">{t('mem.loadingInv')}</p> : data.invitations.length ? <div className="rd-table-wrap"><table className="rd-table"><thead><tr><th>{t('mem.col.email')}</th><th>{t('mem.col.role')}</th><th>{t('mem.col.expires')}</th><th /></tr></thead><tbody>{data.invitations.map((invite) => <tr key={invite.id}><td><span className="rd-rulecell"><span className="rd-tile rd-tile--sm"><Icon name="mail" size={16} /></span><strong>{invite.email}</strong></span></td><td><Pill tone={tone(invite.role)}>{roleLabel(invite.role)}</Pill></td><td>{date(invite.expiresAt)}</td><td>{canInvite && <button type="button" className="rd-btn rd-btn--soft members-revoke" disabled={busy} onClick={() => void revokeInvite(invite.id)}>{t('mem.revoke')}</button>}</td></tr>)}</tbody></table></div>
      : <EmptyState art="envelope" title={t('mem.noPending')} text={canInvite ? t('mem.inviteSub') : undefined}>{canInvite && <button type="button" className="rd-btn rd-btn--soft" onClick={() => document.getElementById('invite-email')?.focus()}><Icon name="plus" size={16} />{t('mem.emptyInvite')}</button>}</EmptyState>}
  </Panel>;

  return <div className="workspace-section-page members-page">
    <PageHeader eyebrow={t('act.eyebrow', { name: workspace.name })} title={t('nav.people')} description={t('mem.desc')} />
    {!isOwner && <p className="members-leave"><span>{t('mem.leaveNote')}</span> <button type="button" disabled={busy} onClick={() => void leaveWorkspace()}>{t('mem.leave')}</button></p>}
    {error && <p className="productivity-error" role="alert">{error}</p>}
    {notice && <p className="members-notice" role="status">{notice}</p>}
    <div className="rd-listbar"><PillTabs label={t('nav.people')} value={tab} onChange={setTab} items={[{ key: 'MEMBERS', label: t('mem.tab.members'), icon: 'users', count: data.members.length }, { key: 'INVITATIONS', label: t('mem.tab.invitations'), icon: 'mail', count: data.invitations.length }]} /></div>
    <div className="members-layout">
      <div className="members-main">
        {tab === 'MEMBERS' ? <Panel title={t('mem.teamTitle')} subtitle={t(data.members.length === 1 ? 'mem.countOne' : 'mem.countMany', { n: data.members.length })} id="members-list" className="members-panel"
          actions={<><div className="rd-search"><Icon name="search" size={18} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('mem.searchMembers')} aria-label={t('mem.searchMembers')} /></div>
            <select className="rd-select" aria-label={t('mem.col.role')} value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="ALL">{t('mem.allRoles')}</option>{Object.keys(roleKeys).map((value) => <option key={value} value={value}>{roleLabel(value)}</option>)}</select></>}>
          {loading ? <p className="productivity-message">{t('mem.loading')}</p> : shownMembers.length === 0 ? <EmptyState art="search" compact title={t('mem.noMatch')} /> : <div className="rd-table-wrap"><table className="rd-table"><thead><tr><th>{t('mem.col.member')}</th><th>{t('mem.col.role')}</th><th>{t('mem.col.joined')}</th><th /></tr></thead><tbody>{shownMembers.map((member) => {
            const isSelf = member.userId === user.id;
            const currentRole = roleDrafts[member.userId] ?? member.role;
            const manageable = canManageMembers && !isSelf && member.role !== 'OWNER' && (isOwner || member.role !== 'ADMINISTRATOR');
            return <tr key={member.userId}>
              <td><span className="rd-rulecell"><Avatar name={member.displayName} size={40} /><span><strong>{member.displayName}{isSelf ? t('mem.you') : ''}</strong><small>{member.email}</small></span></span></td>
              <td><Pill tone={tone(member.role)}>{roleLabel(member.role)}</Pill></td><td>{date(member.createdAt)}</td>
              <td>{manageable && <details className="rd-menu"><summary className="rd-iconbtn" aria-label={t('mem.moreFor', { name: member.displayName })}><Icon name="more" size={20} /></summary><div className="rd-menu__list members-menu">
                <label className="rd-menu__field">{t('mem.col.role')}<select aria-label={t('mem.roleFor', { name: member.displayName })} value={currentRole} onChange={(event) => setRoleDrafts((current) => ({ ...current, [member.userId]: event.target.value }))}>{isOwner && <option value="ADMINISTRATOR">{t('role.administrator')}</option>}<option value="MANAGER">{t('role.manager')}</option><option value="MEMBER">{t('role.member')}</option><option value="GUEST">{t('role.guest')}</option></select></label>
                <button type="button" disabled={busy || currentRole === member.role} onClick={() => void updateRole(member)}><Icon name="checkCircle" size={16} />{t('mem.save')}</button>
                {isOwner && !workspace.isPersonal && member.role !== 'GUEST' && <button type="button" disabled={busy} onClick={() => void makeOwner(member)}><Icon name="shield" size={16} />{t('mem.makeOwner')}</button>}
                <button type="button" className="is-danger" disabled={busy} onClick={() => void removeMember(member)}><Icon name="trash" size={16} />{t('mem.remove')}</button></div></details>}</td></tr>;
          })}</tbody></table></div>}
        </Panel> : pendingPanel}
        {tab === 'MEMBERS' && pendingPanel}
      </div>
      <div className="members-rail">
        <Panel icon="userPlus" title={t('mem.invite')} subtitle={t('mem.inviteSub')} id="invite" className="members-invite-panel">
          {canInvite ? <>
            <form className="members-invite-form" onSubmit={(event) => void createInvite(event)}>
              <label>{t('mem.email')}<input id="invite-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={320} placeholder="teammate@example.com" /></label>
              <label>{t('mem.workspaceRole')}<select value={role} onChange={(event) => setRole(event.target.value)}><option value="ADMINISTRATOR">{t('role.administrator')}</option><option value="MANAGER">{t('role.manager')}</option><option value="MEMBER">{t('role.member')}</option><option value="GUEST">{t('role.guest')}</option></select></label>
              <small>{t('mem.expiry')}</small>
              <button type="submit" className="rd-btn rd-btn--block" disabled={busy || loading}><Icon name="send" size={18} />{busy ? t('mem.creating') : t('mem.send')}</button>
            </form>
            {inviteLink && <div className="members-invite-link" role="status"><strong>{t('mem.ready')}</strong><p>{emailOutcome === 'sent' ? t('mem.sent', { email: inviteeEmail }) : emailOutcome === 'failed' ? t('mem.failed', { email: inviteeEmail }) : t('mem.notSent', { email: inviteeEmail })} {t('mem.shownOnce')}</p><code>{inviteLink}</code><button type="button" onClick={() => void copyInvite()}>{copied ? t('mem.copied') : t('mem.copy')}</button></div>}
          </> : <p className="members-permission-note">{t('mem.onlyAdmins')}</p>}
        </Panel>
        <Panel icon="shield" title={t('mem.rolesTitle')} subtitle={t('mem.rolesSub')} id="roles" className="members-roles">
          <ul className="rd-roles">{(['OWNER', 'ADMINISTRATOR', 'MANAGER', 'MEMBER', 'GUEST'] as const).map((value) => <li key={value}><Pill tone={tone(value)}>{roleLabel(value)}</Pill><span>{t(`mem.roleDesc.${value}` as never)}</span></li>)}</ul>
        </Panel>
      </div>
    </div>
  </div>;
}
