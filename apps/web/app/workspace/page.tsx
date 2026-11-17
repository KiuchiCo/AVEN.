import { UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { AuthSetupNotice } from '../auth-setup-notice';

interface SessionBootstrap {
  user: { id: string; displayName: string; email: string };
  workspace: { id: string; name: string; role: string | null };
}

export const dynamic = 'force-dynamic';

export default async function WorkspacePage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <AuthSetupNotice />;
  }

  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return <AuthSetupNotice />;

  let session: SessionBootstrap | null = null;
  let setupError = false;
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/session/bootstrap`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (response.ok) session = (await response.json()) as SessionBootstrap;
    else setupError = true;
  } catch {
    setupError = true;
  }

  if (!session) {
    return (
      <main className="workspace-state">
        <Link className="auth-brand__wordmark" href="/" aria-label="AVEN home">AVEN<span>.</span></Link>
        <h1>Your account is ready.</h1>
        <p>{setupError ? 'AVEN could not reach the API or database. Check your local setup and try again.' : 'Finish verifying your email, then return here.'}</p>
        <Link className="workspace-action" href="/workspace">Try again</Link>
        <a className="workspace-link" href="/prototype.html">Open the design preview</a>
        <UserButton />
      </main>
    );
  }

  return (
    <main className="workspace-state">
      <header className="workspace-state__header">
        <Link className="auth-brand__wordmark" href="/" aria-label="AVEN home">AVEN<span>.</span></Link>
        <UserButton />
      </header>
      <p className="auth-setup__eyebrow">YOUR WORKSPACE</p>
      <h1>Welcome, {session.user.displayName}.</h1>
      <p>Your personal workspace is set up and ready.</p>
      <section className="workspace-summary" aria-label="Personal workspace">
        <div className="workspace-summary__icon" aria-hidden="true">◈</div>
        <div>
          <h2>{session.workspace.name}</h2>
          <p>{session.workspace.role?.toLowerCase() ?? 'Member'} · {session.user.email}</p>
        </div>
      </section>
      <a className="workspace-link" href="/prototype.html">View the AVEN design preview</a>
    </main>
  );
}
