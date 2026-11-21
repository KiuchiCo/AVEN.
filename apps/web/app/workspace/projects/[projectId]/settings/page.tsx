'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useT } from '../../../../i18n';
import { Panel } from '../../../ui';
import { useProject } from '../../project-context';
import { messageOf } from '../../project-api';
import { dateOnly, projectStatuses } from '../../project-model';
import { ConfirmDialog, Field, statusKey } from '../../project-ui';

const draftOf = (project: ReturnType<typeof useProject>['project']) => ({
  name: project.name, description: project.description ?? '', ownerId: project.ownerId ?? project.owner.id, status: project.status, startAt: dateOnly(project.startAt), dueAt: dateOnly(project.dueAt),
  budgetTotal: project.budgetTotalCents === null ? '' : (project.budgetTotalCents / 100).toFixed(2), budgetSpent: (project.budgetSpentCents / 100).toFixed(2), visibility: project.visibility,
});

/** Configuration and the few actions that cannot be undone. Edits stay in a draft, so leaving the tab does not lose them. */
export default function SettingsTab() {
  const t = useT();
  const router = useRouter();
  const { project, members, request, patchProject, settingsDraft, setSettingsDraft, busy, setBusy, fail, say, clear } = useProject();
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null);
  const [templateName, setTemplateName] = useState('');
  const saved = draftOf(project);
  const draft = { ...saved, ...(settingsDraft ?? {}) };
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const admin = Boolean(project.canAdminister);
  const archived = project.status === 'ARCHIVED';
  const set = (patch: Record<string, string>) => setSettingsDraft({ ...(settingsDraft ?? {}), ...patch });
  const owners = members.filter((member) => member.role !== 'GUEST' || member.userId === saved.ownerId);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (draft.startAt && draft.dueAt && draft.startAt > draft.dueAt) { fail(new Error(t('pw.startAfterDue')), ''); return; }
    const fields: Record<string, unknown> = {};
    if (draft.name.trim() !== saved.name) fields.name = draft.name.trim();
    if (draft.description.trim() !== saved.description) fields.description = draft.description.trim() || null;
    if (draft.status !== saved.status) fields.status = draft.status;
    if (draft.startAt !== saved.startAt) fields.startAt = draft.startAt || null;
    if (draft.dueAt !== saved.dueAt) fields.dueAt = draft.dueAt || null;
    if (draft.budgetTotal !== saved.budgetTotal) fields.budgetTotal = draft.budgetTotal || null;
    if (draft.budgetSpent !== saved.budgetSpent) fields.budgetSpent = draft.budgetSpent || '0';
    if (admin && draft.ownerId !== saved.ownerId) fields.ownerId = draft.ownerId;
    if (admin && draft.visibility !== saved.visibility) fields.visibility = draft.visibility;
    if (!Object.keys(fields).length) return;
    if (await patchProject(fields)) { setSettingsDraft(null); say(t('pw.settingsSaved')); }
  }
  async function archive() {
    const restoring = archived;
    if (await patchProject({ status: restoring ? 'PLANNING' : 'ARCHIVED' })) { setSettingsDraft(null); say(t(restoring ? 'pw.restored' : 'pw.archived', { name: project.name })); }
    setConfirm(null);
  }
  async function destroy() {
    setBusy(true); clear();
    try { await request(`/projects/${project.id}`, { method: 'DELETE' }); router.push('/workspace/projects'); }
    catch (reason) { fail(reason, 'Could not delete this project.'); setConfirm(null); setBusy(false); }
  }
  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    setBusy(true); clear();
    try { await request(`/projects/${project.id}/template`, { method: 'POST', body: JSON.stringify({ name: templateName }) }); setTemplateName(''); say(t('pw.templateSaved')); }
    catch (reason) { fail(new Error(messageOf(reason, 'Could not save this project template.')), ''); } finally { setBusy(false); }
  }
  const spent = Number(draft.budgetSpent || 0); const total = Number(draft.budgetTotal || 0);

  return <div className="pw-stack">
    <form className="pw-stack" onSubmit={(event) => void save(event)}>
      <Panel icon="folder" title={t('pw.details')} subtitle={t('pw.detailsHint')}>
        <div className="pw-form">
          <Field label={t('pj.projectName')}><input required maxLength={160} value={draft.name} onChange={(event) => set({ name: event.target.value })} disabled={archived} /></Field>
          <Field label={t('db.description')}><textarea rows={3} maxLength={5000} value={draft.description} onChange={(event) => set({ description: event.target.value })} disabled={archived} /></Field>
          <div className="pw-form__row">
            <Field label={t('pw.owner')} hint={admin ? undefined : t('pw.ownerOnly')}><select value={draft.ownerId} onChange={(event) => set({ ownerId: event.target.value })} disabled={!admin || archived}>{owners.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></Field>
            <Field label={t('pj.status')}><select value={draft.status} onChange={(event) => set({ status: event.target.value })}>{projectStatuses.map((status) => <option key={status} value={status}>{t(statusKey[status])}</option>)}</select></Field>
            <Field label={t('pj.startDate')}><input type="date" value={draft.startAt} onChange={(event) => set({ startAt: event.target.value })} disabled={archived} /></Field>
            <Field label={t('pj.dueDate')}><input type="date" value={draft.dueAt} onChange={(event) => set({ dueAt: event.target.value })} disabled={archived} /></Field>
          </div>
        </div>
      </Panel>
      <Panel icon="chart" title={t('ph.projectBudget')} subtitle={t('ph.budgetNote')}>
        <div className="pw-form"><div className="pw-form__row">
          <Field label={t('ph.totalBudget')}><input type="number" min="0" step="0.01" value={draft.budgetTotal} onChange={(event) => set({ budgetTotal: event.target.value })} placeholder={t('ph.budgetPh')} disabled={archived} /></Field>
          <Field label={t('ph.amountSpent')}><input type="number" min="0" step="0.01" required value={draft.budgetSpent} onChange={(event) => set({ budgetSpent: event.target.value })} disabled={archived} /></Field>
        </div>{total > 0 && <p className="pw-muted">{t('ph.ofSpent', { total: total.toFixed(2) })} · {Math.round(spent / total * 100)}%</p>}</div>
      </Panel>
      <Panel icon="shield" title={t('pw.visibility')} subtitle={t('pw.visibilityHint')}>
        <fieldset className="pw-choices" disabled={!admin || archived}><legend className="visually-hidden">{t('pw.visibility')}</legend>
          {(['WORKSPACE', 'TEAM'] as const).map((value) => <label key={value} className={draft.visibility === value ? 'is-on' : ''}><input type="radio" name="visibility" value={value} checked={draft.visibility === value} onChange={() => set({ visibility: value })} /><span><strong>{t(value === 'WORKSPACE' ? 'pw.vis.workspace' : 'pw.vis.team')}</strong><small>{t(value === 'WORKSPACE' ? 'pw.vis.workspaceHint' : 'pw.vis.teamHint')}</small></span></label>)}
        </fieldset>
        {!admin && <p className="pw-muted">{t('pw.ownerOnly')}</p>}
        <p className="pw-muted">{t('pw.membersLive')} <Link className="pw-link" href={`/workspace/projects/${project.id}/team`}>{t('pw.openTeam')}</Link></p>
      </Panel>
      <div className="pw-savebar" role="region" aria-label={t('pw.unsaved')}>
        <span>{dirty ? t('pw.unsaved') : t('pw.allSaved')}</span><span className="pw-spacer" />
        <button type="button" className="rd-btn rd-btn--soft" disabled={!dirty || busy} onClick={() => setSettingsDraft(null)}>{t('pw.discard')}</button>
        <button type="submit" className="rd-btn" disabled={!dirty || busy}>{busy ? t('set.saving') : t('pw.saveChanges')}</button>
      </div>
    </form>

    <Panel icon="layers" title={t('pw.saveAsTemplate')} subtitle={t('pj.tplIntro')}>
      <form className="pw-inline-form" onSubmit={(event) => void saveTemplate(event)}><Field label={t('pj.saveTplAs', { name: project.name })}><input required maxLength={160} value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder={t('pj.tplNamePh')} /></Field><button type="submit" className="rd-btn rd-btn--soft" disabled={busy || !templateName.trim()}>{t('pj.saveTpl')}</button></form>
    </Panel>

    <Panel icon="alert" title={t('pw.danger')} className="pw-danger">
      <ul className="pw-rows pw-rows--plain">
        <li><span><strong>{archived ? t('pw.restore') : t('pw.archive')}</strong><small>{archived ? t('pw.restoreHint') : t('pw.archiveHint')}</small></span><button type="button" className="rd-btn rd-btn--soft" disabled={busy} onClick={() => archived ? void archive() : setConfirm('archive')}>{archived ? t('pw.restore') : t('pw.archive')}</button></li>
        <li><span><strong>{t('pw.delete')}</strong><small>{admin ? t('pw.deleteHint') : t('pw.ownerOnlyDelete')}</small></span><button type="button" className="rd-btn pw-btn--danger" disabled={busy || !admin} onClick={() => setConfirm('delete')}>{t('pw.delete')}</button></li>
      </ul>
    </Panel>

    {confirm === 'archive' && <ConfirmDialog title={t('pw.archiveTitle')} danger={false} confirmLabel={t('pw.archive')} busy={busy} onConfirm={() => void archive()} onClose={() => setConfirm(null)}>{t('pw.archiveBody', { name: project.name })}</ConfirmDialog>}
    {confirm === 'delete' && <ConfirmDialog title={t('pw.deleteTitle')} confirmLabel={t('pw.delete')} confirmText={project.name} busy={busy} onConfirm={() => void destroy()} onClose={() => setConfirm(null)}>{t('pw.deleteBody', { name: project.name })}</ConfirmDialog>}
  </div>;
}
