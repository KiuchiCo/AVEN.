'use client';

import { useState } from 'react';
import { useT } from '../../i18n';

type Theme = 'system' | 'light' | 'dark';
const read = (): Theme => { try { const value = localStorage.getItem('aven-theme'); return value === 'dark' || value === 'system' ? value : 'light'; } catch { return 'light'; } };

/** Stored on this device only, and applied before the page paints by the script in the root layout. */
export function ThemeCard() {
  const t = useT();
  const [theme, setTheme] = useState<Theme>(() => (typeof window === 'undefined' ? 'light' : read()));
  function choose(next: Theme) {
    setTheme(next);
    try { localStorage.setItem('aven-theme', next); } catch { /* private mode: applies for this visit only */ }
    const root = document.documentElement; root.setAttribute('data-theme', next);
  }
  return <div className="workspace-settings-card">
    <div><h2>{t('set.theme.title')}</h2><p>{t('set.theme.hint')}</p></div>
    <div className="billing-actions" role="radiogroup" aria-label={t('set.theme.aria')}>
      {(['light', 'dark', 'system'] as const).map((value) => <button key={value} role="radio" aria-checked={theme === value} className="workspace-settings-save" disabled={theme === value} onClick={() => choose(value)}>{value === 'system' ? t('set.theme.system') : value === 'light' ? t('set.theme.light') : t('set.theme.dark')}</button>)}
    </div>
  </div>;
}
