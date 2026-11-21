'use client';

import { useState, type FormEvent } from 'react';
import { useT } from '../../../i18n';
import { messageOf } from '../project-api';
import { useProject } from '../project-context';
import { dateOnly, type Milestone } from '../project-model';
import { Field, Modal } from '../project-ui';

/** Create or edit one milestone: a name, what it means, and when it is due. */
export function MilestoneDialog({ milestone, onClose }: { milestone: Milestone | null; onClose: () => void }) {
  const t = useT();
  const { project, request, reloadMilestones, say, busy, setBusy } = useProject();
  const [problem, setProblem] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setProblem('');
    const body = { title: String(form.get('title') ?? '').trim(), description: String(form.get('description') ?? '').trim() || null, dueAt: String(form.get('dueAt') ?? '') || null };
    try {
      await request(milestone ? `/projects/${project.id}/milestones/${milestone.id}` : `/projects/${project.id}/milestones`, { method: milestone ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      await reloadMilestones();
      say(t(milestone ? 'pw.milestoneSaved' : 'pw.milestoneCreated', { title: body.title })); onClose();
    } catch (reason) { setProblem(messageOf(reason, 'Could not save this milestone.')); } finally { setBusy(false); }
  }
  return <Modal title={milestone ? t('pw.editMilestone') : t('pj.addMilestone')} onClose={onClose} size="sm">
    <form className="pw-form" onSubmit={(event) => void submit(event)}>
      <Field label={t('pj.msName')}><input name="title" required maxLength={160} defaultValue={milestone?.title ?? ''} placeholder={t('ph.msNamePh')} data-autofocus /></Field>
      <Field label={<>{t('db.description')} <small>{t('doc.optional')}</small></>}><textarea name="description" rows={3} maxLength={5000} defaultValue={milestone?.description ?? ''} /></Field>
      <Field label={<>{t('pj.dueDate')} <small>{t('doc.optional')}</small></>}><input name="dueAt" type="date" defaultValue={dateOnly(milestone?.dueAt)} /></Field>
      {problem && <p className="pw-notice pw-notice--error" role="alert">{problem}</p>}
      <div className="pw-actions"><button type="button" className="rd-btn rd-btn--soft" onClick={onClose}>{t('msg.cancel')}</button><button type="submit" className="rd-btn" disabled={busy}>{busy ? t('set.saving') : milestone ? t('pw.saveChanges') : t('pj.addMilestone')}</button></div>
    </form>
  </Modal>;
}
