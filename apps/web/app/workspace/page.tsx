'use client';

import Link from 'next/link';
import { useWorkspaceSession } from './workspace-shell';

const modules = [
  { title: 'Projects', detail: 'Plan work and keep the next steps together.', href: '/workspace/projects', icon: '▱' },
  { title: 'Tasks', detail: 'Capture actions and make progress visible.', href: '/workspace/tasks', icon: '☑' },
  { title: 'Documents', detail: 'Keep notes and plans close to your work.', href: '/workspace/documents', icon: '▤' },
  { title: 'Calendar', detail: 'Bring deadlines and events into one view.', href: '/workspace/calendar', icon: '▦' },
];

export default function WorkspaceHomePage() {
  const { user, workspace } = useWorkspaceSession();
  const firstName = user.displayName.trim().split(/\s+/)[0] || 'there';

  return (
    <div className="workspace-dashboard">
      <section className="workspace-hero">
        <div className="workspace-hero__copy">
          <p className="workspace-eyebrow">YOUR SPACE · {workspace.name}</p>
          <h1>Good to see you, {firstName}.</h1>
          <p>Your workspace is ready. Choose what you would like to organise first.</p>
        </div>
        <div className="workspace-hero__art" aria-hidden="true" />
      </section>

      <section className="workspace-onboarding" aria-labelledby="workspace-start-title">
        <div className="workspace-section-heading">
          <div>
            <p className="workspace-eyebrow">A GOOD PLACE TO BEGIN</p>
            <h2 id="workspace-start-title">Make this space yours</h2>
          </div>
          <span className="workspace-role-pill">{workspace.role?.toLowerCase() ?? 'member'}</span>
        </div>
        <p className="workspace-onboarding__intro">Your account and personal workspace are connected. The sections below are ready to explore as AVEN is built out.</p>
        <div className="workspace-module-grid">
          {modules.map((module) => (
            <Link className="workspace-module-card" href={module.href} key={module.title}>
              <span className="workspace-module-card__icon" aria-hidden="true">{module.icon}</span>
              <span className="workspace-module-card__title">{module.title}<span aria-hidden="true">↗</span></span>
              <span className="workspace-module-card__detail">{module.detail}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="workspace-dashboard__lower">
        <section className="workspace-empty-card" aria-labelledby="recent-title">
          <div className="workspace-section-heading">
            <div>
              <p className="workspace-eyebrow">YOUR WORKSPACE</p>
              <h2 id="recent-title">Recent activity</h2>
            </div>
          </div>
          <div className="workspace-empty-state">
            <span className="workspace-empty-state__icon" aria-hidden="true">✧</span>
            <h3>A clear beginning</h3>
            <p>Projects and activity will appear here when those features are connected.</p>
          </div>
        </section>

        <section className="workspace-intelligence-card" aria-labelledby="intelligence-title">
          <span className="workspace-intelligence-card__sparkle" aria-hidden="true">✧</span>
          <p className="workspace-eyebrow">COMING LATER</p>
          <h2 id="intelligence-title">AVEN Intelligence</h2>
          <p>Once your workspace has content, AVEN can help you bring it together and find a good next step.</p>
          <Link href="/workspace/intelligence">Explore this section <span aria-hidden="true">→</span></Link>
        </section>
      </div>

      <footer className="workspace-dashboard__footer">
        <span>Signed in as {user.email}</span>
        <Link href="/prototype.html">Compare with the original design preview</Link>
      </footer>
    </div>
  );
}
