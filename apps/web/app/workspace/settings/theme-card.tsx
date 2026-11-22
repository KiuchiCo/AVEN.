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
  const values = ['light', 'dark', 'system'] as const;
  // A radio group is one tab stop; the arrow keys move between the choices and choose as they go (the standard keyboard pattern for radio buttons).
  function arrows(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = values[(values.indexOf(theme) + step + values.length) % values.length];
    choose(next);
    (event.currentTarget.querySelector(`[data-theme-choice="${next}"]`) as HTMLElement | null)?.focus();
  }
  return <div className="workspace-settings-card">
    <div><h2>{t('set.theme.title')}</h2><p>{t('set.theme.hint')}</p></div>
    <div className="billing-actions" role="radiogroup" aria-label={t('set.theme.aria')} onKeyDown={arrows}>
      {values.map((value) => <button key={value} type="button" role="radio" data-theme-choice={value} aria-checked={theme === value} tabIndex={theme === value ? 0 : -1} className="workspace-settings-save" aria-current={theme === value ? 'true' : undefined} onClick={() => choose(value)}>{value === 'system' ? t('set.theme.system') : value === 'light' ? t('set.theme.light') : t('set.theme.dark')}</button>)}
    </div>
  </div>;
}
