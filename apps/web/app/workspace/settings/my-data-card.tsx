'use client';

import { useAuth, useClerk } from '@clerk/nextjs';
import { useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import { Modal } from '../projects/project-ui';
import { useWorkspaceSession } from '../workspace-shell';
import { apiFetch } from '../connection-error';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const sizeOf = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** A person's own data: a copy they can download, and deleting the account. The API decides what is allowed; this screen explains it and shows the result. */
export function MyDataCard() {
  const { user } = useWorkspaceSession();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const t = useT();
  const [exporting, setExporting] = useState<'idle' | 'busy'>('idle');
  const [exportStatus, setExportStatus] = useState<{ kind: 'status' | 'alert'; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [alsoSignIn, setAlsoSignIn] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleted, setDeleted] = useState(false);

  async function download() {
    setExporting('busy'); setExportStatus({ kind: 'status', text: t('acct.data.preparing') });
    try {
      const response = await apiFetch(`${apiBase}/session/export`, { headers: { Authorization: `Bearer ${await getToken()}` } });
      if (!response.ok) throw new Error('export refused');
      const blob = await response.blob();
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'aven-my-data.json';
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      setExportStatus({ kind: 'status', text: t('acct.data.done', { size: sizeOf(blob.size) }) });
    } catch { setExportStatus({ kind: 'alert', text: t('acct.data.failed') }); }
    finally { setExporting('idle'); }
  }

  function close() { if (deleting) return; setOpen(false); setTyped(''); setDeleteError(''); setAlsoSignIn(false); }

  async function remove(event: FormEvent) {
    event.preventDefault(); setDeleting(true); setDeleteError('');
    try {
      const response = await apiFetch(`${apiBase}/session/delete-account`, { method: 'POST', headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmEmail: typed, alsoDeleteSignIn: alsoSignIn }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.message === 'string' ? body.message : t('acct.del.failed'));
      setDeleted(true);
      await signOut({ redirectUrl: '/' });
    } catch (reason) { setDeleteError(reason instanceof Error ? reason.message : t('acct.del.failed')); setDeleting(false); }
  }

  const matches = typed.trim().toLowerCase() === user.email.toLowerCase();
  return <>
    <div className="workspace-settings-card">
      <div><h2>{t('acct.data.title')}</h2><p>{t('acct.data.hint')}</p><p id="acct-data-includes"><small>{t('acct.data.includes')}</small></p></div>
      <button type="button" className="workspace-settings-save" onClick={() => void download()} disabled={exporting === 'busy'} aria-describedby="acct-data-includes">{exporting === 'busy' ? t('acct.data.preparing') : t('acct.data.button')}</button>
      {exportStatus && <p className="workspace-settings-status" role={exportStatus.kind}>{exportStatus.text}</p>}
    </div>
    <div className="workspace-settings-card workspace-settings-card--danger">
      <div><h2>{t('acct.del.title')}</h2><p>{t('acct.del.hint')}</p></div>
      <button type="button" className="workspace-settings-save workspace-settings-danger" onClick={() => setOpen(true)}>{t('acct.del.open')}</button>
    </div>
    {open && <Modal title={t('acct.del.title')} onClose={close} size="sm" description={t('acct.del.hint')}>
      <form className="pw-form" onSubmit={(event) => void remove(event)}>
        <ul>{(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const).map((key) => <li key={key}>{t(`acct.del.${key}`)}</li>)}</ul>
        <label htmlFor="delete-account-email">{t('acct.del.confirm', { email: user.email })}</label>
        <input id="delete-account-email" type="email" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" spellCheck={false} data-autofocus aria-invalid={Boolean(typed) && !matches} />
        <label className="pw-check"><input type="checkbox" checked={alsoSignIn} onChange={(event) => setAlsoSignIn(event.target.checked)} /> {t('acct.del.alsoSignIn')}</label>
        {deleteError && <p className="workspace-settings-status" role="alert">{deleteError}</p>}
        {deleted && <p className="workspace-settings-status" role="status">{t('acct.del.done')}</p>}
        <div className="pw-actions"><button type="button" className="rd-btn rd-btn--soft" onClick={close} disabled={deleting}>{t('msg.cancel')}</button><button type="submit" className="rd-btn workspace-settings-danger" disabled={!matches || deleting}>{deleting ? t('acct.del.deleting') : t('acct.del.submit')}</button></div>
      </form>
    </Modal>}
  </>;
}
