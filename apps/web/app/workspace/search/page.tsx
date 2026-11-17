'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useWorkspaceSession } from '../workspace-shell';

type SearchResult = { id: string; type: string; title: string; detail: string; href: string; updatedAt: string };
type SearchResponse = { query: string; results: SearchResult[] };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const filters = ['All', 'Project', 'Task', 'Document', 'Database', 'Record'];

export default function WorkspaceSearchPage() {
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]); setLoading(false); setError('');
      return;
    }
    setLoading(true); setError('');
    const timer = window.setTimeout(() => {
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
      <p className="workspace-eyebrow">YOUR WORKSPACE · {workspace.name}</p>
      <h1>Search</h1>
      <p className="workspace-section-page__description">Find projects, tasks, documents, databases, and records saved in this workspace.</p>

        <label className="workspace-search-input"><span aria-hidden="true">⌕</span><span className="visually-hidden">Search workspace content</span><input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your workspace…" /></label>
      {error && <p className="productivity-error" role="alert">{error}</p>}

      <section className="workspace-search-results" aria-live="polite" aria-busy={loading}>
        <div className="workspace-search-filters" role="group" aria-label="Filter search results">{filters.map((item) => <button key={item} type="button" aria-pressed={filter === item} className={filter === item ? 'workspace-search-filter--active' : ''} onClick={() => setFilter(item)}>{item === 'All' ? 'All' : `${item}s`}</button>)}</div>
        {query.trim().length < 2 ? <p className="productivity-message">Type at least two characters to search saved workspace content.</p> : loading ? <p className="productivity-message">Searching your workspace…</p> : visibleResults.length === 0 ? <p className="productivity-message">No matching {filter === 'All' ? 'items' : `${filter.toLowerCase()}s`} found for “{query.trim()}”.</p> : (
          <div className="workspace-search-list">{visibleResults.map((item) => <Link className="workspace-search-result" key={`${item.type}-${item.id}`} href={item.href}>
            <span className="workspace-search-result__type">{item.type}</span><span className="workspace-search-result__body"><strong>{item.title}</strong><small>{item.detail}</small></span><time dateTime={item.updatedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(item.updatedAt))}</time><span aria-hidden="true">→</span>
          </Link>)}</div>
        )}
      </section>
    </div>
  );
}
