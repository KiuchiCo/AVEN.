'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { useWorkspaceSession } from '../workspace-shell';
import { Icon } from '../home-icons';
import { EmptyState, PageHeader } from '../ui';
import { connectionError, apiFetch } from '../connection-error';

type LabelCount = { label: string; taskCount: number };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

export function TaskLabelsDirectory() {
  const { getToken } = useAuth();
  const t = useT();
  const { workspace } = useWorkspaceSession();
  const [labels, setLabels] = useState<LabelCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const token = await getToken();
        if (!token || !apiBase) throw connectionError(token);
        const response = await apiFetch(`${apiBase}/workspaces/${workspace.id}/tasks/labels`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('Could not load task labels.');
        const next = await response.json() as LabelCount[];
        if (live) setLabels(next);
      } catch (reason) { if (live) setError(reason instanceof Error ? reason.message : 'Could not load task labels.'); }
      finally { if (live) setLoading(false); }
    }
    void load();
    return () => { live = false; };
  }, [getToken, workspace.id]);

  const colours = ['#d9776a', '#7fa36f', '#7c78c8', '#d9a24f', '#5f9bc4', '#b07aa6'];
  const colour = (label: string) => { let hash = 0; for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return colours[hash % colours.length]; };
  return <div className="workspace-section-page task-label-directory">
    <PageHeader eyebrow={t('lab.eyebrow')} title={t('nav.labels')} description={t('lab.desc')} />
    {error && <p className="productivity-error" role="alert">{error}</p>}
    {loading ? <p className="productivity-message">{t('lab.loading')}</p> : labels.length === 0 ? <section className="rd-labelsempty">
      <EmptyState art="tag" title={t('lab.none')} text={t('lab.noneHint')} />
      <div className="rd-tips"><div><span className="rd-tile" aria-hidden="true"><Icon name="tag" size={22} /></span><div><strong>{t('lab.tip1.title')}</strong><p>{t('lab.tip1.text')}</p></div></div><div><span className="rd-tile" aria-hidden="true"><Icon name="filter" size={22} /></span><div><strong>{t('lab.tip2.title')}</strong><p>{t('lab.tip2.text')}</p></div></div><div><span className="rd-tile" aria-hidden="true"><Icon name="chart" size={22} /></span><div><strong>{t('lab.tip3.title')}</strong><p>{t('lab.tip3.text')}</p></div></div></div>
      <div className="rd-empty__actions"><Link className="rd-btn rd-btn--pill" href="/workspace/projects"><Icon name="plus" size={18} />{t('lab.createFirst')}</Link><Link className="rd-btn rd-btn--soft rd-btn--pill" href="/workspace/projects">{t('lab.openProjects')} <span aria-hidden="true">→</span></Link></div>
    </section> : <section className="task-label-directory__grid rd-labelgrid" aria-label={t('lab.gridAria')}>{labels.map(({ label, taskCount }) => <Link key={label} className="task-label-directory__card rd-labelcard" href={`/workspace/tasks?label=${encodeURIComponent(label)}`}><span className="rd-labelcard__dot" style={{ background: colour(label) }} /><span className="task-label">#{label}</span><strong>{t(taskCount === 1 ? 'lab.taskOne' : 'lab.taskMany', { n: taskCount })}</strong><small>{t('lab.view')}</small></Link>)}</section>}
  </div>;
}
