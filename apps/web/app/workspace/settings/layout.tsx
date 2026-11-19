'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useWorkspaceSession } from '../workspace-shell';

const tabs = [{ href: '/workspace/settings', label: 'General' }, { href: '/workspace/settings/security', label: 'Security' }];
const auditTab = { href: '/workspace/settings/audit', label: 'Audit log' };

export default function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const { workspace } = useWorkspaceSession();
  const visible = workspace.role === 'OWNER' || workspace.role === 'ADMINISTRATOR' ? [...tabs, auditTab] : tabs;
  return <>
    <nav className="settings-tabs" aria-label="Settings sections">{visible.map((tab) => <Link key={tab.href} href={tab.href} aria-current={(tab.href === '/workspace/settings' ? pathname === tab.href : pathname.startsWith(tab.href)) ? 'page' : undefined}>{tab.label}</Link>)}</nav>
    {children}
  </>;
}
