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
  try {
    const activeWorkspaceId = (await cookies()).get('aven-workspace-id')?.value;
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/session/bootstrap`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
      cache: 'no-store',
    });
    if (response.ok) session = (await response.json()) as WorkspaceSession;
  } catch {
    // The page below explains the local API/database setup if the request fails.
  }

  if (!session) {
    return (
      <main className="workspace-unavailable">
        <Link className="auth-brand__wordmark" href="/" aria-label="AVEN home">AVEN<span>.</span></Link>
        <p className="auth-setup__eyebrow">Workspace setup</p>
        <h1>Your account is ready.</h1>
        <p>AVEN could not load your workspace. Check that the API and local database are running, then try again.</p>
        <Link className="workspace-unavailable__retry" href="/workspace">Try again</Link>
        <a className="workspace-link" href="/prototype.html">Open the design preview</a>
      </main>
    );
  }

  return <WorkspaceShell session={session}>{children}</WorkspaceShell>;
}
