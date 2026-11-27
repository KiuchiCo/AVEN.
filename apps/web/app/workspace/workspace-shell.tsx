'use client';

import { UserButton, useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { WorkspaceSession } from './layout';
import { timeZoneCookie, timeZoneCookieValue } from '../time-zone-script';
import type { Key } from '../i18n/en';
import { LanguageProvider, translate, useT } from '../i18n';
import { FavouritesProvider, useFavourites } from './favourites';
import { navigationGroups, workspaceNavigation } from './workspace-navigation';
import { OfflineBanner } from './offline-banner';
import { TaskSyncBanner, TaskSyncProvider } from './task-sync';
import { WorkspaceSwitcher } from './workspace-switcher';
import { MobileTabBar } from '../mobile/mobile-tab-bar';
import { NativeEvents } from '../mobile/native-events';
import { apiFetch } from './connection-error';

const WorkspaceContext = createContext<WorkspaceSession | null>(null);
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

export function useWorkspaceSession() {
  const session = useContext(WorkspaceContext);
  if (!session) throw new Error('useWorkspaceSession must be used inside WorkspaceShell.');
  return session;
}

const noSubscription = () => () => undefined;
// The sidebar's collapsed/expanded choice is remembered on this device and applies to every workspace.
const sidebarListeners = new Set<() => void>();
const readSidebarCollapsed = () => { try { return localStorage.getItem('aven-sidebar') === 'collapsed'; } catch { return false; } };
function subscribeSidebar(listener: () => void) { sidebarListeners.add(listener); window.addEventListener('storage', listener); return () => { sidebarListeners.delete(listener); window.removeEventListener('storage', listener); }; }

export function WorkspaceShell({ session, children }: Readonly<{ session: WorkspaceSession; children: ReactNode }>) {
  // Pages show dates and times in this person's own locale and time zone, which the server can't know. Rendering page
  // content only once the browser has taken over means the server's guess is never compared with the real thing.
  const ready = useSyncExternalStore(noSubscription, () => true, () => false);
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeSidebar, readSidebarCollapsed, () => false);
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);
  const { getToken } = useAuth();
  const [unread, setUnread] = useState(0);
  const [planName, setPlanName] = useState('');
  const t = (key: Key, values?: Record<string, string | number>) => translate(session.user.language, key, values);
  // Detail pages (a task, a project's board) take their section's name, so the bar never falls back to a generic title.
  const activeItem = workspaceNavigation.filter((item) => pathname === item.href || (item.href !== '/workspace' && pathname.startsWith(`${item.href}/`))).sort((a, b) => b.href.length - a.href.length)[0];
  const pageTitle = pathname === '/workspace/search' ? t('shell.pageSearch') : pathname.startsWith('/workspace/settings') ? t('shell.settings') : activeItem ? t(activeItem.key) : t('shell.pageWorkspace');

  // A time zone chosen on another device is applied here too: remember it in the cookie the page reads on load, then reload once.
  useEffect(() => {
    const wanted = session.user.timeZone ?? null;
    const current = document.cookie.match(new RegExp(`(?:^|; )${timeZoneCookie}=([^;]+)`));
    const have = current ? decodeURIComponent(current[1]) : null;
    if (wanted === have) return;
    try { if (sessionStorage.getItem('aven-tz-synced')) return; sessionStorage.setItem('aven-tz-synced', '1'); } catch { return; }
    document.cookie = timeZoneCookieValue(wanted);
    window.location.reload();
  }, [session.user.timeZone]);

  // The sidebar shows real numbers: unread notifications and the workspace's plan.
  useEffect(() => {
    let live = true;
    void (async () => {
      const token = await getToken(); if (!token || !apiBase) return;
      const headers = { Authorization: `Bearer ${token}` };
      const [dashboard, billing] = await Promise.all([apiFetch(`${apiBase}/workspaces/${session.workspace.id}/dashboard`, { headers, cache: 'no-store' }), apiFetch(`${apiBase}/workspaces/${session.workspace.id}/billing`, { headers, cache: 'no-store' })]);
      if (!live) return;
      if (dashboard.ok) setUnread(Number((await dashboard.json() as { unreadInbox?: number }).unreadInbox ?? 0));
      if (billing.ok) setPlanName(String((await billing.json() as { plan?: { name?: string } }).plan?.name ?? ''));
    })().catch(() => undefined);
    return () => { live = false; };
  }, [getToken, pathname, session.workspace.id]);

  function toggleSidebar() { try { localStorage.setItem('aven-sidebar', collapsed ? 'expanded' : 'collapsed'); } catch { /* storage unavailable: the choice just won't be remembered */ } sidebarListeners.forEach((listener) => listener()); }

  // Escape closes the create menu and the phone drawer; a click outside closes the create menu.
  useEffect(() => {
    if (!createOpen && !mobileOpen) return;
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape') { setCreateOpen(false); setMobileOpen(false); } }
    function onPointer(event: PointerEvent) { if (createRef.current && !createRef.current.contains(event.target as Node)) setCreateOpen(false); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onPointer); };
  }, [createOpen, mobileOpen]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented) return; // the document editor uses Cmd/Ctrl + K for links when text is selected
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
      <LanguageProvider language={session.user.language}>
      <FavouritesProvider workspaceId={session.workspace.id}>
      <TaskSyncProvider>
      <NativeEvents />
      <div className={`workspace-app${collapsed ? ' workspace-app--collapsed' : ''}`}>
        <a className="workspace-skip" href="#workspace-content">{t('shell.skip')}</a>
        {mobileOpen && (
          <button
            className="workspace-sidebar-scrim"
            onClick={() => setMobileOpen(false)}
            aria-label={t('shell.closeNav')}
          />
        )}
        <aside id="workspace-navigation" className={`workspace-sidebar${mobileOpen ? ' workspace-sidebar--open' : ''}`}>
          <button type="button" className="workspace-sidebar__collapse" onClick={toggleSidebar} aria-pressed={collapsed} aria-controls="workspace-navigation" aria-label={collapsed ? t('shell.expandNav') : t('shell.collapseNav')} title={collapsed ? t('shell.expandNav') : t('shell.collapseNav')}><NavIcon name="back" /></button>
          <div className="workspace-sidebar__brand">
            <Link className="auth-brand__wordmark" href="/workspace" aria-label={t('ws.home')}>AVEN<span>.</span></Link>
            <p>{t('shell.tagline')}</p>
          </div>

          <WorkspaceSwitcher session={session} />

          <nav className="workspace-nav" aria-label={t('shell.navAria')}>
            {navigationGroups.map((group, index) => <div className="workspace-nav__group" key={group.label ?? 'main'}>
              {group.key && <p className="workspace-nav__label">{t(group.key)}</p>}
              {group.hrefs.map((href) => {
                const item = workspaceNavigation.find((entry) => entry.href === href); if (!item) return null;
                const active = href === '/workspace' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
                return <Link key={href} className={`workspace-nav__item${active ? ' workspace-nav__item--active' : ''}`} href={href} aria-current={active ? 'page' : undefined} title={collapsed ? t(item.key) : undefined} onClick={() => setMobileOpen(false)}>
                  <NavIcon name={item.icon} /><span>{t(item.key)}</span>
                  {href === '/workspace/inbox' && unread > 0 && <b className="workspace-nav__badge" aria-label={t('shell.unread', { n: unread })}>{unread > 99 ? '99+' : unread}</b>}
                </Link>;
              })}
              {index === 0 && <span className="workspace-nav__rule" aria-hidden="true" />}
            </div>)}
            <FavouritesNav onNavigate={() => setMobileOpen(false)} />
          </nav>

          <div className="workspace-sidebar__bottom">
            <div className="workspace-profile">
              <UserButton />
              <div className="workspace-profile__text">
                <strong>{session.user.displayName}</strong>
                <span>{planName ? t('shell.plan', { name: planName }) : session.workspace.role?.toLowerCase() ?? 'member'}</span>
              </div>
              <Link className="workspace-profile__settings" href="/workspace/settings" aria-label={t('shell.settings')}><NavIcon name="settings" /></Link>
            </div>
          </div>
        </aside>

        <div className="workspace-main">
          <header className="workspace-topbar">
            <div className="workspace-topbar__leading">
              <button className="workspace-menu-toggle" onClick={() => setMobileOpen((open) => !open)} aria-expanded={mobileOpen} aria-controls="workspace-navigation" aria-label={mobileOpen ? t('shell.closeNav') : t('shell.openNav')}><NavIcon name="menu" /></button>
              <div className="workspace-history" role="group" aria-label={t('shell.history')}>
                <button type="button" onClick={() => router.back()} aria-label={t('shell.back')}><NavIcon name="back" /></button>
                <button type="button" onClick={() => window.history.forward()} aria-label={t('shell.forward')}><NavIcon name="forward" /></button>
              </div>
              {pathname !== '/workspace' && <p className="workspace-breadcrumb"><strong>{pageTitle}</strong></p>}
            </div>
            <div className="workspace-topbar__actions">
              {/* The visible words are the link's name (WCAG 2.5.3); on narrow screens they are hidden visually, not removed. */}
              <Link className="workspace-topbar__search" href="/workspace/search">
                <NavIcon name="search" />
                <span>{t('shell.searchPlaceholder')}</span><kbd aria-hidden="true">⌘K</kbd>
              </Link>
              <Link className="workspace-bell" href="/workspace/inbox" aria-label={unread > 0 ? `${t('nav.inbox')}, ${t('shell.unread', { n: unread })}` : t('nav.inbox')}><NavIcon name="bell" />{unread > 0 && <i aria-hidden="true" />}</Link>
              {session.workspace.role !== 'GUEST' && <div className="workspace-create" ref={createRef}>
              <button
                className="workspace-create-button"
                onClick={() => setCreateOpen((open) => !open)}
                aria-expanded={createOpen}
                aria-controls="workspace-create-menu"
              >
                {t('shell.create')} <svg className="workspace-create-button__chevron" aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {createOpen && (
                <div id="workspace-create-menu" className="workspace-create-menu">
                  <p>{t('shell.createHint')}</p>
                  <Link href="/workspace/projects" onClick={() => setCreateOpen(false)}><NavIcon name="projects" /> {t('nav.projects')}</Link>
                  <Link href="/workspace/tasks" onClick={() => setCreateOpen(false)}><NavIcon name="tasks" /> {t('shell.createTasks')}</Link>
                  <Link href="/workspace/documents" onClick={() => setCreateOpen(false)}><NavIcon name="documents" /> {t('nav.documents')}</Link>
                  <Link href="/workspace/databases" onClick={() => setCreateOpen(false)}><NavIcon name="databases" /> {t('nav.databases')}</Link>
                </div>
              )}
              </div>}
            </div>
          </header>

          <main id="workspace-content" className="workspace-content" tabIndex={-1}>
            <OfflineBanner />
            <TaskSyncBanner />
            {session.workspace.role === 'GUEST' && <p className="workspace-readonly-banner" role="status">{t('shell.guest')}</p>}
            {ready ? <Fragment key={session.workspace.id}>{children}</Fragment> : <div className="ds-skeleton" aria-busy="true" aria-label={t('shell.loading')}><i /><i /><i /></div>}
          </main>
        </div>
        <MobileTabBar unread={unread} moreOpen={mobileOpen} onMore={() => setMobileOpen((open) => !open)} />
      </div>
      </TaskSyncProvider>
      </FavouritesProvider>
      </LanguageProvider>
    </WorkspaceContext.Provider>
  );
}

/** Pinned pages, newest last. Hidden until something is pinned, so there is never an empty, do-nothing section. */
function FavouritesNav({ onNavigate }: { onNavigate: () => void }) {
  const t = useT();
  const favourites = useFavourites();
  const pathname = usePathname();
  if (!favourites || favourites.items.length === 0) return null;
  return <div className="workspace-nav__group workspace-nav__favourites"><p className="workspace-nav__label">{t('group.favourites')}</p>{favourites.items.map((item) => <Link key={item.id} className={`workspace-nav__item${pathname === item.href ? ' workspace-nav__item--active' : ''}`} href={item.href} onClick={onNavigate}><NavIcon name="folder" /><span>{item.title}</span></Link>)}</div>;
}

type IconName = 'folder' | 'settings' | 'bell' | 'back' | 'forward' | 'home' | 'inbox' | 'tasks' | 'labels' | 'projects' | 'documents' | 'files' | 'whiteboards' | 'messages' | 'analytics' | 'knowledge' | 'calendar' | 'databases' | 'intelligence' | 'automations' | 'activity' | 'people' | 'menu' | 'search';

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    inbox: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 13h5l2 3h4l2-3h5" /></>,
    tasks: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m8 12 2.5 2.5L16 9" /></>,
    labels: <><path d="M20.5 13 13 20.5a2.1 2.1 0 0 1-3 0L3.5 14V3.5H14l6.5 6.5a2.1 2.1 0 0 1 0 3Z" /><circle cx="8" cy="8" r="1.2" /></>,
    projects: <><path d="M3 7.5h7l2 2h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h6" /></>,
    documents: <><path d="M6 3h8l5 5v13H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v6h5M8 13h8M8 17h8" /></>,
    analytics: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    messages: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>,
    whiteboards: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21l4-4 4 4M7 12l3-3 3 3 4-4" /></>,
    files: <><path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" /><path d="M13 3v6h6M12 18v-6M9.5 14.5 12 12l2.5 2.5" /></>,
    knowledge: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20M8 7h8M8 10h6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></>,
    databases: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
    intelligence: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></>,
    automations: <><path d="m13 2-3 8h7L10 22l2-9H5l8-11z" /></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
    bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 20a1.9 1.9 0 0 0 3.4 0" /></>,
    back: <><path d="m15 6-6 6 6 6" /></>,
    forward: <><path d="m9 6 6 6-6 6" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}
