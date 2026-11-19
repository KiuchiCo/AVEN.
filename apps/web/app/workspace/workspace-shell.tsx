'use client';

import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { WorkspaceSession } from './layout';
import { workspaceNavigation } from './workspace-navigation';
import { WorkspaceSwitcher } from './workspace-switcher';

const WorkspaceContext = createContext<WorkspaceSession | null>(null);

export function useWorkspaceSession() {
  const session = useContext(WorkspaceContext);
  if (!session) throw new Error('useWorkspaceSession must be used inside WorkspaceShell.');
  return session;
}

export function WorkspaceShell({ session, children }: Readonly<{ session: WorkspaceSession; children: ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const activeItem = workspaceNavigation.find((item) => item.href === pathname);
  const pageTitle = pathname === '/workspace/search' ? 'Search' : activeItem?.label ?? 'Workspace';

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        router.push('/workspace/search');
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [router]);

  return (
    <WorkspaceContext.Provider value={session}>
      <div className="workspace-app">
        {mobileOpen && (
          <button
            className="workspace-sidebar-scrim"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
        )}
        <aside id="workspace-navigation" className={`workspace-sidebar${mobileOpen ? ' workspace-sidebar--open' : ''}`}>
          <div className="workspace-sidebar__brand">
            <Link className="auth-brand__wordmark" href="/workspace" aria-label="AVEN home">AVEN<span>.</span></Link>
            <p>Your entire world, organised.</p>
          </div>

          <WorkspaceSwitcher session={session} />

          <nav className="workspace-nav" aria-label="Workspace navigation">
            <p className="workspace-nav__label">Workspace</p>
            {workspaceNavigation.map((item) => {
              const active = item.href === '/workspace'
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  className={`workspace-nav__item${active ? ' workspace-nav__item--active' : ''}`}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setMobileOpen(false)}
                >
                  <NavIcon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="workspace-sidebar__bottom">
            <div className="workspace-sidebar__preview">
              <p>Design reference</p>
              <Link href="/prototype.html">Open the original preview <span aria-hidden="true">↗</span></Link>
            </div>
            <div className="workspace-profile">
              <UserButton />
              <div className="workspace-profile__text">
                <strong>{session.user.displayName}</strong>
                <span>{session.workspace.role?.toLowerCase() ?? 'member'}</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="workspace-main">
          <header className="workspace-topbar">
            <div className="workspace-topbar__leading">
              <button
                className="workspace-menu-toggle"
                onClick={() => setMobileOpen((open) => !open)}
                aria-expanded={mobileOpen}
                aria-controls="workspace-navigation"
                aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
              >
                <NavIcon name="menu" />
              </button>
              <p className="workspace-breadcrumb"><span>My Workspace</span><span aria-hidden="true">/</span><strong>{pageTitle}</strong></p>
            </div>
            <div className="workspace-topbar__actions">
              <Link className="workspace-topbar__search" href="/workspace/search" aria-label="Search your workspace">
                <NavIcon name="search" />
                <span>Search your workspace</span><kbd>⌘ K</kbd>
              </Link>
              {session.workspace.role !== 'GUEST' && <>
              <button
                className="workspace-create-button"
                onClick={() => setCreateOpen((open) => !open)}
                aria-expanded={createOpen}
                aria-controls="workspace-create-menu"
              >
                <span aria-hidden="true">＋</span> Create <span className="workspace-create-button__chevron" aria-hidden="true">⌄</span>
              </button>
              {createOpen && (
                <div id="workspace-create-menu" className="workspace-create-menu">
                  <p>Start with a section</p>
                  <Link href="/workspace/projects" onClick={() => setCreateOpen(false)}><NavIcon name="projects" /> Projects</Link>
                  <Link href="/workspace/tasks" onClick={() => setCreateOpen(false)}><NavIcon name="tasks" /> Tasks</Link>
                  <Link href="/workspace/documents" onClick={() => setCreateOpen(false)}><NavIcon name="documents" /> Documents</Link>
                  <Link href="/workspace/databases" onClick={() => setCreateOpen(false)}><NavIcon name="databases" /> Databases</Link>
                  <small>More creation options will be added as each section is built.</small>
                </div>
              )}
              </>}
            </div>
          </header>

          <main className="workspace-content">
            {session.workspace.role === 'GUEST' && <p className="workspace-readonly-banner" role="status">Guest access is read-only. You can browse workspace information, but editing is disabled.</p>}
            {children}
          </main>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}

type IconName = 'home' | 'inbox' | 'tasks' | 'labels' | 'projects' | 'documents' | 'files' | 'whiteboards' | 'knowledge' | 'calendar' | 'databases' | 'intelligence' | 'automations' | 'activity' | 'people' | 'menu' | 'search';

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    inbox: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 13h5l2 3h4l2-3h5" /></>,
    tasks: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m8 12 2.5 2.5L16 9" /></>,
    labels: <><path d="M20.5 13 13 20.5a2.1 2.1 0 0 1-3 0L3.5 14V3.5H14l6.5 6.5a2.1 2.1 0 0 1 0 3Z" /><circle cx="8" cy="8" r="1.2" /></>,
    projects: <><path d="M3 7.5h7l2 2h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h6" /></>,
    documents: <><path d="M6 3h8l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v6h5M8 13h8M8 17h8" /></>,
    whiteboards: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21l4-4 4 4M7 12l3-3 3 3 4-4" /></>,
    files: <><path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" /><path d="M13 3v6h6M12 18v-6M9.5 14.5 12 12l2.5 2.5" /></>,
    knowledge: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20M8 7h8M8 10h6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></>,
    databases: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
    intelligence: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></>,
    automations: <><path d="m13 2-3 8h7L10 22l2-9H5l8-11z" /></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}
