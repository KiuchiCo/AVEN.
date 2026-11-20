'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/en';
import { useWorkspaceSession } from '../workspace-shell';
import { TaskLabels } from '../task-labels';

type SearchResult = { id: string; type: string; title: string; detail: string; href: string; updatedAt: string; labels?: string[] };
type SearchResponse = { query: string; results: SearchResult[] };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const filters = ['All', 'Project', 'Task', 'Document', 'Database', 'Record', 'Knowledge', 'Event'];
const filterKeys: Record<string, Key> = { All: 'act.f.all', Project: 'act.f.project', Task: 'act.f.task', Document: 'act.f.document', Database: 'nav.databases', Record: 'srch.f.record', Knowledge: 'act.f.knowledge', Event: 'srch.f.event' };
const typeKeys: Record<string, Key> = { Project: 'entity.project', Task: 'entity.task', Document: 'entity.document', Database: 'srch.t.database', Record: 'srch.t.record', Knowledge: 'entity.knowledge', Event: 'srch.t.event' };

export default function WorkspaceSearchPage() {
  const { getToken } = useAuth();
  const t = useT();
  const { workspace } = useWorkspaceSession();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void (async () => {
        try {
          const token = await getToken();
          if (!token || !apiBase) throw new Error('AVEN could not connect to the API. Check your local API setup.');
          const response = await fetch(`${apiBase}/workspaces/${workspace.id}/search?q=${encodeURIComponent(trimmed)}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!response.ok) {
            const body = await response.json().catch(() => null) as { message?: string } | null;
            throw new Error(body?.message ?? 'Search could not be completed.');
          }
          const data = await response.json() as SearchResponse;
          if (!cancelled) setResults(data.results);
        } catch (reason) {
          if (!cancelled) setError(reason instanceof Error ? reason.message : 'Search could not be completed.');
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [getToken, query, workspace.id]);

  const visibleResults = filter === 'All' ? results : results.filter((item) => item.type === filter);

  return (
    <div className="workspace-section-page workspace-search-page">
      <p className="workspace-eyebrow">{t('act.eyebrow', { name: workspace.name })}</p>
      <h1>{t('shell.pageSearch')}</h1>
      <p className="workspace-section-page__description">{t('srch.desc')}</p>

        <label className="workspace-search-input"><span aria-hidden="true">⌕</span><span className="visually-hidden">{t('srch.label')}</span><input autoFocus type="search" value={query} onChange={(event) => { const next = event.target.value; setQuery(next); setResults([]); setError(''); setLoading(next.trim().length >= 2); }} placeholder={t('srch.placeholder')} /></label>
      {error && <p className="productivity-error" role="alert">{error}</p>}

      <section className="workspace-search-results" aria-live="polite" aria-busy={query.trim().length >= 2 && loading}>
        <div className="workspace-search-filters" role="group" aria-label={t('srch.filterAria')}>{filters.map((item) => <button key={item} type="button" aria-pressed={filter === item} className={filter === item ? 'workspace-search-filter--active' : ''} onClick={() => setFilter(item)}>{t(filterKeys[item])}</button>)}</div>
        {query.trim().length < 2 ? <p className="productivity-message">{t('srch.min')}</p> : loading ? <p className="productivity-message">{t('srch.searching')}</p> : visibleResults.length === 0 ? <p className="productivity-message">{filter === 'All' ? t('srch.noneAll', { q: query.trim() }) : t('srch.noneType', { type: t(filterKeys[filter]).toLocaleLowerCase(), q: query.trim() })}</p> : (
          <div className="workspace-search-list">{visibleResults.map((item) => <Link className="workspace-search-result" key={`${item.type}-${item.id}`} href={item.href}>
            <span className="workspace-search-result__type">{typeKeys[item.type] ? t(typeKeys[item.type]).replace(/^./, (c) => c.toLocaleUpperCase()) : item.type}</span><span className="workspace-search-result__body"><strong>{item.title}</strong><small>{item.detail}</small>{item.type === 'Task' && item.labels && <TaskLabels labels={item.labels} compact />}</span><time dateTime={item.updatedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(item.updatedAt))}</time><span aria-hidden="true">→</span>
          </Link>)}</div>
        )}
      </section>
    </div>
  );
}
