'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { useWorkspaceSession } from '../workspace-shell';

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
        if (!token || !apiBase) throw new Error('AVEN could not connect to the API.');
        const response = await fetch(`${apiBase}/workspaces/${workspace.id}/tasks/labels`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('Could not load task labels.');
        const next = await response.json() as LabelCount[];
        if (live) setLabels(next);
      } catch (reason) { if (live) setError(reason instanceof Error ? reason.message : 'Could not load task labels.'); }
      finally { if (live) setLoading(false); }
    }
    void load();
    return () => { live = false; };
  }, [getToken, workspace.id]);

  return <div className="workspace-section-page task-label-directory">
    <p className="workspace-eyebrow">{t('lab.eyebrow')}</p><h1>{t('nav.labels')}</h1>
    <p className="workspace-section-page__description">{t('lab.desc')}</p>
    {error && <p className="productivity-error" role="alert">{error}</p>}
    {loading ? <p className="productivity-message">{t('lab.loading')}</p> : labels.length === 0 ? <section className="task-list-empty"><span aria-hidden="true">#</span><h2>{t('lab.none')}</h2><p>{t('lab.noneHint')}</p><Link href="/workspace/projects">{t('tasks.openProjects')} →</Link></section> : <section className="task-label-directory__grid" aria-label={t('lab.gridAria')}>{labels.map(({ label, taskCount }) => <Link key={label} className="task-label-directory__card" href={`/workspace/tasks?label=${encodeURIComponent(label)}`}><span className="task-label">#{label}</span><strong>{t(taskCount === 1 ? 'lab.taskOne' : 'lab.taskMany', { n: taskCount })}</strong><small>{t('lab.view')}</small></Link>)}</section>}
  </div>;
}
