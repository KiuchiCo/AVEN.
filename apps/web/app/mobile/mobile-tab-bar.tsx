'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import type { Key } from '../i18n/en';
import { haptic } from './native';

type Tab = { key: Key; href: string; icon: string };
const tabs: Tab[] = [
  { key: 'nav.home', href: '/workspace', icon: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10' },
  { key: 'nav.inbox', href: '/workspace/inbox', icon: 'M4 13h4.5l1.5 2.5h4l1.5-2.5H20M4 13l2-7.5h12l2 7.5v6H4z' },
  { key: 'nav.tasks', href: '/workspace/tasks', icon: 'M5 12.5l4 4 10-10' },
  { key: 'nav.calendar', href: '/workspace/calendar', icon: 'M5 6.5h14v13H5zM5 10.5h14M9 4v4M15 4v4' },
];

/** Tells whether the on-screen keyboard is open, so the bar can get out of the way of typing. */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport; if (!viewport) return;
    const check = () => setOpen(window.innerHeight - viewport.height > 120);
    viewport.addEventListener('resize', check); check();
    return () => viewport.removeEventListener('resize', check);
  }, []);
  return open;
}

/**
 * The bar along the bottom of a phone-sized window: the four places people go most, and More, which opens the full list (every module, the workspace switcher and Settings).
 * It appears only below 768 px wide, never while the keyboard is open, and leaves room for the home indicator.
 */
export function MobileTabBar({ unread, moreOpen, onMore }: { unread: number; moreOpen: boolean; onMore: () => void }) {
  const t = useT();
  const pathname = usePathname();
  const keyboard = useKeyboardOpen();
  const current = (href: string) => (href === '/workspace' ? pathname === '/workspace' : pathname.startsWith(href));
  return <nav className={`mobile-tabbar${keyboard ? ' is-hidden' : ''}`} aria-label={t('mobile.tabs')}>
    {tabs.map((tab) => <Link key={tab.href} href={tab.href} className={current(tab.href) ? 'is-current' : ''} aria-current={current(tab.href) ? 'page' : undefined} onClick={() => haptic('selection')}>
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={tab.icon} /></svg>
      <span>{t(tab.key)}</span>
      {tab.href === '/workspace/inbox' && unread > 0 && <i aria-label={t('shell.unread', { n: unread })}>{unread > 99 ? '99+' : unread}</i>}
    </Link>)}
    <button type="button" className={moreOpen ? 'is-current' : ''} aria-expanded={moreOpen} aria-controls="workspace-navigation" onClick={() => { haptic('light'); onMore(); }}>
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" /></svg>
      <span>{t('mobile.more')}</span>
    </button>
  </nav>;
}
