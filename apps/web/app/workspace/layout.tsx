import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { pickLanguage, translate } from '../i18n/core';
import { requestLanguage } from '../i18n/request-language';
import { AuthSetupNotice } from '../auth-setup-notice';
import { WorkspaceShell } from './workspace-shell';

export interface WorkspaceSession {
  user: { id: string; displayName: string; email: string; timeZone?: string | null; language?: string | null };
  workspace: { id: string; name: string; role: string | null; memberCount?: number; isPersonal?: boolean };
}

export const dynamic = 'force-dynamic';

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <AuthSetupNotice />;
  }

  const { userId, getToken } = await auth();
  if (!userId) redirect('/sign-in');

  const token = await getToken();
  if (!token) redirect('/sign-in');

  let session: WorkspaceSession | null = null;
  let expired = false;
  try {
    const activeWorkspaceId = (await cookies()).get('aven-workspace-id')?.value;
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/session/bootstrap`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
      cache: 'no-store',
    });
    if (response.ok) session = (await response.json()) as WorkspaceSession;
    else expired = response.status === 401; // a stale sign-in cookie, not a missing API: a full reload refreshes it
  } catch {
    // The page below explains the local API/database setup if the request fails.
  }

  if (!session) {
    // Without a session the saved language is unknown, so the browser's language is used.
    const language = pickLanguage((await headers()).get('accept-language'));
    const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
    const developing = process.env.NODE_ENV !== 'production';
    return (
      <main className="workspace-unavailable" lang={language}>
        <Link className="auth-brand__wordmark" href="/" aria-label={t('ws.home')}>AVEN<span>.</span></Link>
        <p className="auth-setup__eyebrow">{t('ws.eyebrow')}</p>
        <h1>{expired ? t('ws.expiredTitle') : t('ws.unavailableTitle')}</h1>
        <p>{expired ? t('ws.expired') : developing ? t('ws.unavailableDev') : t('ws.unavailable')}</p>
        {/* A full page load, not client navigation, so Clerk can refresh the session cookie first. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="workspace-unavailable__retry" href="/workspace">{t('ws.retry')}</a>
        {developing && <a className="workspace-link" href="/prototype.html">{t('ws.preview')}</a>}
      </main>
    );
  }

  // No saved language yet: follow this device's choice or the browser, as the sign-in pages and Clerk do, rather than defaulting to English.
  const language = session.user.language ?? await requestLanguage();
  return <WorkspaceShell session={{ ...session, user: { ...session.user, language } }}>{children}</WorkspaceShell>;
}
