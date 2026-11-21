'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { Icon } from '../home-icons';
import { EmptyState, PageHeader, PillTabs, StatCard, StatRow } from '../ui';
import { NewProjectDialog } from './new-project-dialog';
import { messageOf, useProjectApi } from './project-api';
import { directoryCounts, directoryRows, type DirectorySort, type Member, type Project } from './project-model';
import { LoadingBlock, Notice, ProjectCard, statusKey } from './project-ui';
import { TemplatesTab } from './templates-tab';
import type { ProjectTemplate } from './templates/types';

/** Level one: every project at a glance, and the template library. Nothing about a single project's work is shown here. */
export function ProjectsDirectory() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const { request, workspace } = useProjectApi();
  const tab = params.get('tab') === 'templates' ? 'TEMPLATES' : 'PROJECTS';
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [query, setQuery] = useState(''); const [status, setStatus] = useState('ALL'); const [sort, setSort] = useState<DirectorySort>('UPDATED');
  const [creating, setCreating] = useState<{ templateId?: string } | null>(null);

  const reload = useCallback(async () => {
    const [projectRows, templateRows, memberRows] = await Promise.all([request<Project[]>('/projects'), request<ProjectTemplate[]>('/projects/project-templates'), request<Member[]>('/members')]);
    setProjects(projectRows); setTemplates(templateRows); setMembers(memberRows);
  }, [request]);
  useEffect(() => {
    let live = true;
    void (async () => {
      try { await reload(); } catch (reason) { if (live) setError(messageOf(reason, 'Could not load workspace projects.')); } finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [reload]);

  const counts = useMemo(() => directoryCounts(projects), [projects]);
  const rows = useMemo(() => directoryRows(projects, query, status, sort), [projects, query, status, sort]);
  const setTab = (next: 'PROJECTS' | 'TEMPLATES') => router.replace(next === 'TEMPLATES' ? '/workspace/projects?tab=templates' : '/workspace/projects', { scroll: false });
  const statuses = ['ALL', 'PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'];

  return <div className="pw-page">
    <PageHeader eyebrow={t('act.eyebrow', { name: workspace.name })} title={t('nav.projects')} description={t('pw.directoryHint')}>
      <button type="button" className="rd-btn" onClick={() => setCreating({})}><Icon name="plus" size={18} />{t('pw.newProject')}</button>
    </PageHeader>
    <PillTabs label={t('pw.directoryTabs')} value={tab} onChange={setTab} items={[{ key: 'PROJECTS', label: t('pw.allProjects'), icon: 'folder', count: counts.total }, { key: 'TEMPLATES', label: t('pw.templates'), icon: 'layers', count: templates.length }]} />
    {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    {notice && <Notice kind="success" onClose={() => setNotice('')}>{notice}</Notice>}

    {tab === 'PROJECTS' ? <>
      <StatRow columns={4} label={t('pw.directoryStats')}>
        <StatCard icon="folder" value={counts.total} label={t('pw.totalProjects')} />
        <StatCard icon="refresh" tone="blue" value={counts.inProgress} label={t('pj.s.inProgress')} />
        <StatCard icon="checkCircle" tone="green" value={counts.completed} label={t('pj.s.completed')} />
        <StatCard icon="clock" tone="violet" value={counts.onHold} label={t('pj.s.onHold')} />
      </StatRow>
      <div className="pw-toolbar">
        <label className="pw-search"><Icon name="search" size={16} /><span className="visually-hidden">{t('pj.search')}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('pw.searchProjects')} /></label>
        <label className="pw-sort"><span className="visually-hidden">{t('pj.status')}</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((value) => <option key={value} value={value}>{value === 'ALL' ? t('pw.allStatuses') : t(statusKey[value])}{value === 'ARCHIVED' && counts.archived ? ` (${counts.archived})` : ''}</option>)}</select></label>
        <label className="pw-sort"><span className="visually-hidden">{t('pj.sort')}</span><select value={sort} onChange={(event) => setSort(event.target.value as DirectorySort)}><option value="UPDATED">{t('pw.sort.updated')}</option><option value="DUE">{t('pw.sort.due')}</option><option value="NAME">{t('pw.sort.name')}</option></select></label>
      </div>
      {loading ? <LoadingBlock rows={3} label={t('pj.loading')} />
        : projects.length === 0 ? <EmptyState art="folder" title={t('pw.noProjectsTitle')} text={t('pw.noProjectsText')}><button type="button" className="rd-btn" onClick={() => setCreating({})}><Icon name="plus" size={18} />{t('pw.newProject')}</button><button type="button" className="rd-btn rd-btn--soft" onClick={() => setCreating({ templateId: templates[0]?.id })} disabled={templates.length === 0}>{t('pw.useTemplate')}</button></EmptyState>
          : rows.length === 0 ? <EmptyState art="search" title={t('pw.noProjectMatch')} text={t('pw.noProjectMatchText')}><button type="button" className="rd-btn rd-btn--soft" onClick={() => { setQuery(''); setStatus('ALL'); }}>{t('pj.clearFilters')}</button></EmptyState>
            : <div className="pw-cards">{rows.map((project) => <ProjectCard key={project.id} project={project} />)}</div>}
    </> : <TemplatesTab templates={templates} ready={!loading && !error} reload={reload} onUse={(template) => setCreating({ templateId: template.id })} onMessage={(message) => { setError(''); setNotice(message); }} onError={(message) => { setNotice(''); setError(message); }} />}

    {creating && <NewProjectDialog templates={templates} members={members} initialTemplateId={creating.templateId} onClose={() => setCreating(null)} />}
  </div>;
}
