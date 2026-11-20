'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import { useWorkspaceSession } from '../workspace-shell';

const tabs = [{ href: '/workspace/settings', label: 'set.tabs.general' as const }, { href: '/workspace/settings/security', label: 'set.tabs.security' as const }];
const auditTab = { href: '/workspace/settings/audit', label: 'set.tabs.audit' as const };
const connectionsTab = { href: '/workspace/settings/connections', label: 'set.tabs.connections' as const };

export default function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const { workspace } = useWorkspaceSession();
  const t = useT();
  const visible = workspace.role === 'OWNER' || workspace.role === 'ADMINISTRATOR' ? [...tabs, connectionsTab, auditTab] : tabs;
  return <>
    <nav className="settings-tabs" aria-label={t('set.tabs.aria')}>{visible.map((tab) => <Link key={tab.href} href={tab.href} aria-current={(tab.href === '/workspace/settings' ? pathname === tab.href : pathname.startsWith(tab.href)) ? 'page' : undefined}>{t(tab.label)}</Link>)}</nav>
    {children}
  </>;
}
