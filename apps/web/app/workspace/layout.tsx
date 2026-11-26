import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
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
    return (
      <main className="workspace-unavailable">
        <Link className="auth-brand__wordmark" href="/" aria-label="AVEN home">AVEN<span>.</span></Link>
        <p className="auth-setup__eyebrow">Workspace setup</p>
        <h1>Your account is ready.</h1>
        <p>{expired ? 'Your sign-in needs refreshing before AVEN can load your workspace.' : 'AVEN could not load your workspace. Check that the API and local database are running, then try again.'}</p>
        {/* A full page load, not client navigation, so Clerk can refresh the session cookie first. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="workspace-unavailable__retry" href="/workspace">Try again</a>
        <a className="workspace-link" href="/prototype.html">Open the design preview</a>
      </main>
    );
  }

  return <WorkspaceShell session={session}>{children}</WorkspaceShell>;
}
