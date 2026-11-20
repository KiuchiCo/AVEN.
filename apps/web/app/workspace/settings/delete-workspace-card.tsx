'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import { useWorkspaceSession } from '../workspace-shell';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

/** Owners of a shared workspace can delete it for good, after typing its name. */
export function DeleteWorkspaceCard() {
  const { workspace } = useWorkspaceSession();
  const { getToken } = useAuth();
  const t = useT();
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (workspace.role !== 'OWNER' || workspace.isPersonal) return null;

  async function remove(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/workspaces/${workspace.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: typed }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? 'Could not delete the workspace.');
      await fetch('/api/active-workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      router.push('/workspace'); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete the workspace.'); setBusy(false); }
  }

  return <div className="workspace-settings-card workspace-settings-card--danger">
    <div><h2>{t('set.del.title')}</h2><p>{t('set.del.body')}</p></div>
    <form onSubmit={remove}>
      <label htmlFor="delete-workspace-name">{t('set.del.confirmLabel', { name: workspace.name })}</label>
      <input id="delete-workspace-name" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
      <button className="workspace-settings-save workspace-settings-danger" disabled={busy || typed.trim() !== workspace.name}>{busy ? t('set.del.deleting') : t('set.del.btn')}</button>
      {error && <p className="workspace-settings-status" role="alert">{error}</p>}
    </form>
  </div>;
}
