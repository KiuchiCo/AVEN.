'use client';

import { useState, type FormEvent } from 'react';
import { useT } from '../../../i18n';
import { messageOf } from '../project-api';
import { useProject } from '../project-context';
import { Field, Modal, roleKey } from '../project-ui';

/** Invites someone who is not in the workspace yet. They join the workspace first; adding them to this team is then one click. */
export function InviteDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { request, busy, setBusy, say } = useProject();
  const [problem, setProblem] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setProblem('');
    try {
      const email = String(form.get('email') ?? '').trim();
      await request('/members/invitations', { method: 'POST', body: JSON.stringify({ email, role: form.get('role') }) });
      say(t('pw.invited', { email })); onClose();
    } catch (reason) { setProblem(messageOf(reason, 'Could not send this invitation.')); } finally { setBusy(false); }
  }
  return <Modal title={t('pw.inviteTitle')} description={t('pw.inviteText')} size="sm" onClose={onClose}>
    <form className="pw-form" onSubmit={(event) => void submit(event)}>
      <Field label={t('pw.email')}><input name="email" type="email" required maxLength={320} autoComplete="off" data-autofocus /></Field>
      <Field label={t('pw.role')}><select name="role" defaultValue="MEMBER">{['MEMBER', 'MANAGER', 'GUEST'].map((role) => <option key={role} value={role}>{t(roleKey[role])}</option>)}</select></Field>
      {problem && <p className="pw-notice pw-notice--error" role="alert">{problem}</p>}
      <div className="pw-actions"><button type="button" className="rd-btn rd-btn--soft" onClick={onClose}>{t('msg.cancel')}</button><button type="submit" className="rd-btn" disabled={busy}>{busy ? t('set.saving') : t('pw.sendInvite')}</button></div>
    </form>
  </Modal>;
}
