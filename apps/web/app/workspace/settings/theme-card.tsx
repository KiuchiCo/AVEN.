'use client';

import { useState } from 'react';

type Theme = 'system' | 'light' | 'dark';
const read = (): Theme => { try { const value = localStorage.getItem('aven-theme'); return value === 'light' || value === 'dark' ? value : 'system'; } catch { return 'system'; } };

/** Stored on this device only, and applied before the page paints by the script in the root layout. */
export function ThemeCard() {
  const [theme, setTheme] = useState<Theme>(() => (typeof window === 'undefined' ? 'system' : read()));
  function choose(next: Theme) {
    setTheme(next);
    try { if (next === 'system') localStorage.removeItem('aven-theme'); else localStorage.setItem('aven-theme', next); } catch { /* private mode: applies for this visit only */ }
    const root = document.documentElement; if (next === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', next);
  }
  return <div className="workspace-settings-card">
    <div><h2>Appearance</h2><p>Choose light or dark, or follow your device. This is remembered on this device.</p></div>
    <div className="billing-actions" role="radiogroup" aria-label="Theme">
      {(['system', 'light', 'dark'] as const).map((value) => <button key={value} role="radio" aria-checked={theme === value} className="workspace-settings-save" disabled={theme === value} onClick={() => choose(value)}>{value === 'system' ? 'Match device' : value === 'light' ? 'Light' : 'Dark'}</button>)}
    </div>
  </div>;
}
