'use client';

import Link from 'next/link';
import { useWorkspaceSession } from './workspace-shell';
import { HomeDashboard } from './home-dashboard';

export default function WorkspaceHomePage() {
  const { user, workspace } = useWorkspaceSession();
  const firstName = user.displayName.trim().split(/\s+/)[0] || 'there';

  return (
    <div className="workspace-dashboard">
      <section className="workspace-hero">
        <div className="workspace-hero__copy">
          <p className="workspace-eyebrow">YOUR SPACE · {workspace.name}</p>
          <h1>Good to see you, {firstName}.</h1>
          <p>Your projects, tasks, documents and calendar come together in one workspace.</p>
        </div>
        <div className="workspace-hero__art" aria-hidden="true" />
      </section>

      <HomeDashboard />

      <footer className="workspace-dashboard__footer">
        <span>Signed in as {user.email}</span>
        <Link href="/prototype.html">Compare with the original design preview</Link>
      </footer>
    </div>
  );
}
