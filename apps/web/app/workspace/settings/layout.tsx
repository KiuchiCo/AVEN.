'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const tabs = [{ href: '/workspace/settings', label: 'General' }, { href: '/workspace/settings/security', label: 'Security' }];

export default function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  return <>
    <nav className="settings-tabs" aria-label="Settings sections">{tabs.map((tab) => <Link key={tab.href} href={tab.href} aria-current={(tab.href === '/workspace/settings' ? pathname === tab.href : pathname.startsWith(tab.href)) ? 'page' : undefined}>{tab.label}</Link>)}</nav>
    {children}
  </>;
}
