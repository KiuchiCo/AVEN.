'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useT } from '../../../i18n';
import type { Key } from '../../../i18n/en';
import { FavouriteStar } from '../../favourites';
import { Icon, type IconName } from '../../home-icons';
import { EmptyState } from '../../ui';
import { ProjectProvider, useProject } from '../project-context';
import { LoadingBlock, Notice, PersonChip, StatusPill, formatDate } from '../project-ui';
import { TaskDialog } from '../tasks/task-dialog';

const tabs: { slug: string; label: Key; icon: IconName }[] = [
  { slug: '', label: 'pw.tab.overview', icon: 'grid' }, { slug: 'tasks', label: 'pw.tab.tasks', icon: 'checkCircle' }, { slug: 'milestones', label: 'pw.tab.milestones', icon: 'flag' },
  { slug: 'team', label: 'pw.tab.team', icon: 'users' }, { slug: 'files', label: 'pw.tab.files', icon: 'attach' }, { slug: 'settings', label: 'pw.tab.settings', icon: 'sliders' },
];

/** One layout for all six tabs: it loads the project once, so moving between tabs never reloads it or drops what was typed. */
export default function ProjectLayout({ children }: { children: ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const t = useT();
  return <ProjectProvider key={projectId} projectId={projectId} fallback={(state, message) => <div className="pw-page">
    <nav className="pw-crumbs" aria-label={t('pw.breadcrumb')}><Link href="/workspace/projects"><Icon name="back" size={16} />{t('pw.allProjects')}</Link></nav>
    {state === 'loading' ? <LoadingBlock rows={4} label={t('ph.loading')} /> : <EmptyState art="folder" title={state === 'missing' ? t('ph.unavailable') : t('pw.loadFailed')} text={state === 'missing' ? t('ph.unavailableBody') : message}><Link className="rd-btn rd-btn--soft" href="/workspace/projects">{t('ph.backToProjects')}</Link></EmptyState>}
  </div>}><Frame>{children}</Frame></ProjectProvider>;
}

function Frame({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const { project, tasks, milestones, team, error, notice, clear, taskDialog, openTask } = useProject();
  const base = `/workspace/projects/${project.id}`;
  const counts: Record<string, number> = { tasks: tasks.length, milestones: milestones.length, team: team.length };
  return <div className="pw-page">
    <nav className="pw-crumbs" aria-label={t('pw.breadcrumb')}><Link href="/workspace/projects"><Icon name="back" size={16} />{t('pw.allProjects')}</Link></nav>
    <header className="pw-head">
      <div className="pw-head__text">
        <div className="pw-head__title"><h1>{project.name}</h1><StatusPill status={project.status} /></div>
        <p className="pw-head__meta"><PersonChip name={project.owner.displayName} /><span><Icon name="calendar" size={15} />{project.dueAt ? t('pw.dueOn', { date: formatDate(project.dueAt, '') }) : t('ph.noDateSet')}</span></p>
      </div>
      <div className="pw-head__actions"><FavouriteStar kind="PROJECT" entityId={project.id} /><button type="button" className="rd-btn" onClick={() => openTask(null)} disabled={project.status === 'ARCHIVED'}><Icon name="plus" size={18} />{t('pw.newTask')}</button></div>
    </header>
    <nav className="pw-tabs" aria-label={t('ph.sectionsAria')}>{tabs.map((tab) => {
      const href = tab.slug ? `${base}/${tab.slug}` : base;
      const active = tab.slug ? pathname === href || pathname.startsWith(`${href}/`) : pathname === base;
      return <Link key={tab.slug || 'overview'} href={href} className={active ? 'is-active' : ''} aria-current={active ? 'page' : undefined} prefetch={false}><Icon name={tab.icon} size={17} /><span>{t(tab.label)}</span>{counts[tab.slug] !== undefined && <small>{counts[tab.slug]}</small>}</Link>;
    })}</nav>
    {error && <Notice kind="error" onClose={clear}>{error}</Notice>}
    {notice && <Notice kind="success" onClose={clear}>{notice}</Notice>}
    {project.status === 'ARCHIVED' && <p className="pw-banner"><Icon name="info" size={16} />{t('pw.archivedBanner')}</p>}
    <div className="pw-content">{children}</div>
    {taskDialog && <TaskDialog />}
  </div>;
}
