'use client';

import { useAuth } from '@clerk/nextjs';
import { useState } from 'react';
import { isLanguage, languages, useT } from '../../i18n';
import { useWorkspaceSession } from '../workspace-shell';
import { apiFetch } from '../connection-error';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

/** The interface language is saved on your account, so it follows you to other devices. */
export function LanguageCard() {
  const { user } = useWorkspaceSession();
  const { getToken } = useAuth();
  const t = useT();
  const [value, setValue] = useState(isLanguage(user.language) ? user.language : 'en');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(next: string) {
    setValue(next as typeof value); setBusy(true); setStatus('');
    try {
      const token = await getToken();
      const response = await apiFetch(`${apiBase}/session/me`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ language: next === 'en' ? null : next }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message ?? 'Could not save your language.');
      setStatus(t('settings.language.saved'));
      window.location.reload();
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not save your language.'); setBusy(false); }
  }

  return <div className="workspace-settings-card">
    <div><h2>{t('settings.language.title')}</h2><p>{t('settings.language.hint')}</p></div>
    <label htmlFor="language-select" className="visually-hidden">{t('settings.language.title')}</label>
    <select id="language-select" value={value} disabled={busy} onChange={(event) => void save(event.target.value)}>{languages.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}</select>
    {status && <p className="workspace-settings-status" role="status">{status}</p>}
  </div>;
}
