'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { useT } from '../../../../i18n';
import { Icon } from '../../../home-icons';
import { Avatar, Panel, Pill, StatCard, StatRow } from '../../../ui';
import { useProject } from '../../project-context';
import { workload } from '../../project-model';
import { ConfirmDialog, Field, roleKey } from '../../project-ui';
import { InviteDialog } from '../../team/invite-dialog';
import { WorkloadBars } from '../../team/workload-bars';
import type { TeamMember } from '../../project-model';

/** Who is on this project and how much each person has on their plate. Workload counts this project's tasks only. */
export default function TeamTab() {
  const t = useT();
  const { project, tasks, team, members, request, reloadTeam, busy, setBusy, fail, say, clear } = useProject();
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [pick, setPick] = useState('');
  const manage = Boolean(project.canAdminister) && project.status !== 'ARCHIVED';
  const rows = useMemo(() => workload(tasks, team, t('pj.unassigned')), [tasks, team, t]);
  const onTeam = new Set(team.map((member) => member.userId));
  const candidates = members.filter((member) => !onTeam.has(member.userId));
  const open = tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED');
  const unassigned = rows.find((row) => row.userId === null)?.outstanding ?? 0;
  const byUser = new Map(rows.map((row) => [row.userId, row]));

  async function add(event: FormEvent, userId = pick) {
    event.preventDefault();
    if (!userId) return;
    setBusy(true); clear();
    try { await request(`/projects/${project.id}/team`, { method: 'POST', body: JSON.stringify({ userId }) }); await reloadTeam(); setPick(''); say(t('pw.memberAdded')); }
    catch (reason) { fail(reason, 'Could not add this person.'); } finally { setBusy(false); }
  }
  async function remove(member: TeamMember) {
    setBusy(true); clear();
    try { await request(`/projects/${project.id}/team/${member.userId}`, { method: 'DELETE' }); await reloadTeam(); say(t('pw.memberRemoved', { name: member.displayName })); }
    catch (reason) { fail(reason, 'Could not remove this person.'); } finally { setBusy(false); setRemoving(null); }
  }
  const strays = rows.filter((row) => row.userId && !onTeam.has(row.userId) && row.assigned > 0);

  return <div className="pw-stack">
    <StatRow columns={4} label={t('pw.tab.team')}>
      <StatCard icon="users" value={team.length} label={t('pw.teamMembers')} />
      <StatCard icon="tasks" tone="blue" value={open.length} label={t('pw.outstanding')} />
      <StatCard icon="alert" tone="red" value={rows.reduce((sum, row) => sum + row.overdue, 0)} label={t('pj.overdue')} />
      <StatCard icon="userPlus" tone="violet" value={unassigned} label={t('pj.unassigned')} />
    </StatRow>

    <Panel icon="users" title={t('pw.members')} subtitle={t('pw.membersHint')} actions={manage ? <button type="button" className="rd-btn rd-btn--soft rd-btn--small" onClick={() => setInviting(true)}><Icon name="mail" size={16} />{t('pw.inviteTitle')}</button> : undefined}>
      {manage && candidates.length > 0 && <form className="pw-inline-form" onSubmit={(event) => void add(event)}>
        <Field label={t('pw.addMember')}><select value={pick} onChange={(event) => setPick(event.target.value)}><option value="">{t('pw.chooseMember')}</option>{candidates.map((member) => <option key={member.userId} value={member.userId}>{member.displayName} · {t(roleKey[member.role] ?? 'role.member')}</option>)}</select></Field>
        <button type="submit" className="rd-btn" disabled={busy || !pick}>{t('pw.add')}</button>
      </form>}
      <div className="pw-table pw-table--team" role="table" aria-label={t('pw.members')}>
        <div className="pw-table__head" role="row"><span role="columnheader">{t('pw.person')}</span><span role="columnheader">{t('pw.role')}</span><span role="columnheader">{t('pw.assigned')}</span><span role="columnheader">{t('status.completed')}</span><span role="columnheader">{t('pw.outstanding')}</span><span role="columnheader">{t('pj.overdue')}</span><span role="columnheader"><span className="visually-hidden">{t('file.colActions')}</span></span></div>
        {team.map((member) => { const row = byUser.get(member.userId); return <div key={member.userId} className="pw-table__row" role="row">
          <span role="cell" className="pw-table__who"><Avatar name={member.displayName} size={32} /><span><strong>{member.displayName}</strong>{member.isOwner && <Pill tone="bronze">{t('pw.owner')}</Pill>}</span></span>
          <span role="cell" data-label={t('pw.role')}>{t(roleKey[member.role] ?? 'role.member')}<small className="pw-muted pw-block">{member.role === 'GUEST' ? t('pw.canView') : t('pw.canEdit')}</small></span>
          <span role="cell" data-label={t('pw.assigned')}>{row?.assigned ?? 0}</span><span role="cell" data-label={t('status.completed')}>{row?.completed ?? 0}</span><span role="cell" data-label={t('pw.outstanding')}>{row?.outstanding ?? 0}</span><span role="cell" data-label={t('pj.overdue')} className={row?.overdue ? 'is-overdue' : ''}>{row?.overdue ?? 0}</span>
          <span role="cell" className="pw-table__edit">{manage && !member.isOwner && <button type="button" className="rd-btn rd-btn--soft rd-btn--small" onClick={() => setRemoving(member)} disabled={busy}>{t('ph.remove')}</button>}</span>
        </div>; })}
      </div>
      {strays.length > 0 && <div className="pw-callout"><p>{t('pw.strayTitle')}</p><ul className="pw-rows">{strays.map((row) => <li key={row.userId}><span><strong>{row.name}</strong><small>{t('pw.strayCount', { n: row.assigned })}</small></span>{manage && <button type="button" className="rd-btn rd-btn--soft rd-btn--small" disabled={busy} onClick={(event) => void add(event, row.userId ?? '')}>{t('pw.add')}</button>}</li>)}</ul></div>}
    </Panel>

    <div className="pw-grid pw-grid--2">
      <Panel icon="chart" title={t('pw.distribution')} subtitle={t('pw.distributionHint')}><WorkloadBars rows={rows} /></Panel>
      <Panel icon="shield" title={t('pw.permissions')} subtitle={t('pw.permissionsHint')}>
        <ul className="pw-rows pw-rows--plain">
          <li><span><strong>{t('role.owner')} · {t('role.administrator')}</strong><small>{t('pw.perm.admin')}</small></span></li>
          <li><span><strong>{t('pw.projectOwner')}</strong><small>{t('pw.perm.owner')}</small></span></li>
          <li><span><strong>{t('role.manager')} · {t('role.member')}</strong><small>{t('pw.perm.member')}</small></span></li>
          <li><span><strong>{t('role.guest')}</strong><small>{t('pw.perm.guest')}</small></span></li>
        </ul>
        <Link className="pw-link" href="/workspace/members">{t('pw.manageRoles')}</Link>
      </Panel>
    </div>

    {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    {removing && <ConfirmDialog title={t('pw.removeMemberTitle')} confirmLabel={t('ph.remove')} busy={busy} onConfirm={() => void remove(removing)} onClose={() => setRemoving(null)}>{t('pw.removeMemberBody', { name: removing.displayName })}</ConfirmDialog>}
  </div>;
}
