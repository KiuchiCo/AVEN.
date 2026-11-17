'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from '../workspace-shell';

type KnowledgeItem = { id: string; title: string; content: string; sourceUrl: string | null; tags: string[]; isPinned: boolean; archivedAt: string | null; updatedAt: string; createdBy: { displayName: string } };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

export function KnowledgeHub() {
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API. Check your local API setup.');
    const response = await fetch(`${apiBase}${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...options.headers } });
    if (!response.ok) { const body = await response.json().catch(() => null) as { message?: string } | null; throw new Error(body?.message ?? 'AVEN could not complete that request.'); }
    return response.json();
  }, [getToken]);

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await request(`/workspaces/${workspace.id}/knowledge?archived=${showArchived}`) as KnowledgeItem[]); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load Knowledge.'); }
    finally { setLoading(false); }
  }, [request, showArchived, workspace.id]);

  useEffect(() => { void reload(); }, [reload]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return items;
    return items.filter((item) => `${item.title} ${item.content} ${item.tags.join(' ')}`.toLocaleLowerCase().includes(query));
  }, [items, search]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true); setError('');
    const payload = { title: form.get('title'), content: form.get('content'), sourceUrl: form.get('sourceUrl') || null, tags: String(form.get('tags') ?? '').split(',').map((tag) => tag.trim()).filter(Boolean) };
    try {
      await request(`/workspaces/${workspace.id}/knowledge${editing ? `/${editing.id}` : ''}`, { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      setEditing(null); formElement.reset(); await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this Knowledge item.'); }
    finally { setBusy(false); }
  }

  async function updateItem(item: KnowledgeItem, payload: Record<string, unknown>) {
    setBusy(true); setError('');
    try { await request(`/workspaces/${workspace.id}/knowledge/${item.id}`, { method: 'PATCH', body: JSON.stringify(payload) }); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this Knowledge item.'); }
    finally { setBusy(false); }
  }

  async function archiveItem(item: KnowledgeItem) {
    setBusy(true); setError('');
    try { await request(`/workspaces/${workspace.id}/knowledge/${item.id}/archive`, { method: 'POST', body: JSON.stringify({ archived: !showArchived }) }); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update archive status.'); }
    finally { setBusy(false); }
  }

  const pinnedCount = items.filter((item) => item.isPinned).length;
  return <div className="workspace-section-page knowledge-page">
    <p className="workspace-eyebrow">YOUR WORKSPACE · {workspace.name}</p><h1>Knowledge</h1>
    <p className="workspace-section-page__description">Keep useful references, decisions, and notes together. AVEN Intelligence can find them when you search your workspace.</p>
    {error && <p className="productivity-error" role="alert">{error}</p>}
    <div className="knowledge-toolbar"><label className="knowledge-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this Knowledge hub…" /></label><div><span>{items.length} {items.length === 1 ? 'item' : 'items'}{!showArchived && ` · ${pinnedCount} pinned`}</span><button type="button" aria-pressed={showArchived} onClick={() => { setShowArchived((value) => !value); setEditing(null); }}>{showArchived ? 'View active' : 'View archive'}</button></div></div>
    {!showArchived && <form className="knowledge-compose" key={editing?.id ?? 'new-knowledge'} onSubmit={save}>
      <div className="knowledge-compose__heading"><div><p className="workspace-eyebrow">{editing ? 'UPDATE REFERENCE' : 'BUILD YOUR SHARED LIBRARY'}</p><h2>{editing ? 'Edit Knowledge item' : 'Add to Knowledge'}</h2></div>{editing && <button type="button" onClick={() => setEditing(null)}>Cancel</button>}</div>
      <label>Title<input name="title" defaultValue={editing?.title ?? ''} required maxLength={200} placeholder="A useful reference or team decision" /></label>
      <label>Notes<textarea name="content" defaultValue={editing?.content ?? ''} required maxLength={20000} rows={5} placeholder="Capture the information your team will want to find later…" /></label>
      <div className="knowledge-compose__row"><label>Source URL <span>(optional)</span><input name="sourceUrl" type="url" defaultValue={editing?.sourceUrl ?? ''} placeholder="https://…" /></label><label>Tags <span>(comma-separated)</span><input name="tags" defaultValue={editing?.tags.join(', ') ?? ''} placeholder="product, research, decisions" /></label></div>
      <button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save reference'}</button>
    </form>}
    <section className="knowledge-list" aria-label={showArchived ? 'Archived Knowledge items' : 'Knowledge items'}>
      {loading ? <p className="productivity-message">Loading Knowledge…</p> : visibleItems.length === 0 ? <div className="knowledge-empty"><span aria-hidden="true">◇</span><h2>{search ? 'No matching references' : showArchived ? 'Your archive is empty' : 'Start a shared reference library'}</h2><p>{search ? 'Try a different title, note, or tag.' : showArchived ? 'Archived Knowledge items will be available here.' : 'Save decisions, research notes, and links here so the whole workspace can find them.'}</p></div> : <div className="knowledge-grid">{visibleItems.map((item) => <article className="knowledge-card" key={item.id}>
        <div className="knowledge-card__meta"><span>{item.isPinned ? '★ PINNED' : 'REFERENCE'}</span><time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(item.updatedAt))}</time></div>
        <h2>{item.title}</h2><p>{item.content}</p>
        {item.sourceUrl && <a className="knowledge-card__source" href={item.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a>}
        {item.tags.length > 0 && <div className="knowledge-tags">{item.tags.map((tag) => <button type="button" key={tag} onClick={() => setSearch(tag)}>#{tag}</button>)}</div>}
        <footer><small>Added by {item.createdBy.displayName}</small><div>{!showArchived && <button type="button" disabled={busy} onClick={() => void updateItem(item, { isPinned: !item.isPinned })}>{item.isPinned ? 'Unpin' : 'Pin'}</button>}<button type="button" disabled={busy} onClick={() => showArchived ? void archiveItem(item) : setEditing(item)}>{showArchived ? 'Restore' : 'Edit'}</button>{!showArchived && <button type="button" disabled={busy} onClick={() => void archiveItem(item)}>Archive</button>}</div></footer>
      </article>)}</div>}
    </section>
  </div>;
}
