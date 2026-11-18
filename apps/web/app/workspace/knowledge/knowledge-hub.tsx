'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from '../workspace-shell';

type LinkedRecord = { id: string; name?: string; title?: string };
type KnowledgeItem = { id: string; title: string; content: string; sourceUrl: string | null; tags: string[]; isPinned: boolean; archivedAt: string | null; updatedAt: string; createdBy: { displayName: string }; project: LinkedRecord | null; document: LinkedRecord | null; task: LinkedRecord | null; _count: { versions: number } };
type KnowledgeVersion = { id: string; title: string; content: string; sourceUrl: string | null; tags: string[]; createdAt: string; createdBy: { displayName: string }; project: LinkedRecord | null; document: LinkedRecord | null; task: LinkedRecord | null };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

export function KnowledgeHub() {
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [projects, setProjects] = useState<LinkedRecord[]>([]);
  const [documents, setDocuments] = useState<LinkedRecord[]>([]);
  const [tasks, setTasks] = useState<LinkedRecord[]>([]);
  const [versions, setVersions] = useState<Record<string, KnowledgeVersion[]>>({});
  const [historyId, setHistoryId] = useState<string | null>(null);
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
  useEffect(() => {
    void Promise.all([
      request(`/workspaces/${workspace.id}/projects`),
      request(`/workspaces/${workspace.id}/documents`),
      request(`/workspaces/${workspace.id}/tasks`),
    ]).then(([projectData, documentData, taskData]) => {
      setProjects(projectData as LinkedRecord[]); setDocuments(documentData as LinkedRecord[]); setTasks(taskData as LinkedRecord[]);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load workspace links.'));
  }, [request, workspace.id]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return items;
    return items.filter((item) => `${item.title} ${item.content} ${item.tags.join(' ')}`.toLocaleLowerCase().includes(query));
  }, [items, search]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true); setError('');
    const payload = {
      title: form.get('title'), content: form.get('content'), sourceUrl: form.get('sourceUrl') || null,
      tags: String(form.get('tags') ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
      projectId: form.get('projectId') || null, documentId: form.get('documentId') || null, taskId: form.get('taskId') || null,
    };
    try {
      await request(`/workspaces/${workspace.id}/knowledge${editing ? `/${editing.id}` : ''}`, { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      if (editing) setVersions((value) => ({ ...value, [editing.id]: [] }));
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

  async function toggleHistory(item: KnowledgeItem) {
    if (historyId === item.id) { setHistoryId(null); return; }
    setHistoryId(item.id);
    if (versions[item.id]) return;
    try { const history = await request(`/workspaces/${workspace.id}/knowledge/${item.id}/versions`) as KnowledgeVersion[]; setVersions((value) => ({ ...value, [item.id]: history })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load version history.'); }
  }

  async function restoreVersion(item: KnowledgeItem, version: KnowledgeVersion) {
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/knowledge/${item.id}/versions/${version.id}/restore`, { method: 'POST' });
      setVersions((value) => ({ ...value, [item.id]: [] })); await reload();
      const history = await request(`/workspaces/${workspace.id}/knowledge/${item.id}/versions`) as KnowledgeVersion[];
      setVersions((value) => ({ ...value, [item.id]: history }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not restore this version.'); }
    finally { setBusy(false); }
  }

  const pinnedCount = items.filter((item) => item.isPinned).length;
  return <div className="workspace-section-page knowledge-page">
    <p className="workspace-eyebrow">YOUR WORKSPACE · {workspace.name}</p><h1>Knowledge</h1>
    <p className="workspace-section-page__description">Keep useful references, decisions, and notes together. Link them to the work they support, and revisit earlier versions when plans change.</p>
    {error && <p className="productivity-error" role="alert">{error}</p>}
    <div className="knowledge-toolbar"><label className="knowledge-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this Knowledge hub…" /></label><div><span>{items.length} {items.length === 1 ? 'item' : 'items'}{!showArchived && ` · ${pinnedCount} pinned`}</span><button type="button" aria-pressed={showArchived} onClick={() => { setShowArchived((value) => !value); setEditing(null); setHistoryId(null); }}>{showArchived ? 'View active' : 'View archive'}</button></div></div>
    {!showArchived && <form className="knowledge-compose" key={editing?.id ?? 'new-knowledge'} onSubmit={save}>
      <div className="knowledge-compose__heading"><div><p className="workspace-eyebrow">{editing ? 'UPDATE REFERENCE' : 'BUILD YOUR SHARED LIBRARY'}</p><h2>{editing ? 'Edit Knowledge item' : 'Add to Knowledge'}</h2></div>{editing && <button type="button" onClick={() => setEditing(null)}>Cancel</button>}</div>
      <label>Title<input name="title" defaultValue={editing?.title ?? ''} required maxLength={200} placeholder="A useful reference or team decision" /></label>
      <label>Notes<textarea name="content" defaultValue={editing?.content ?? ''} required maxLength={20000} rows={5} placeholder="Capture the information your team will want to find later…" /></label>
      <div className="knowledge-compose__row"><label>Source URL <span>(optional)</span><input name="sourceUrl" type="url" defaultValue={editing?.sourceUrl ?? ''} placeholder="https://…" /></label><label>Tags <span>(comma-separated)</span><input name="tags" defaultValue={editing?.tags.join(', ') ?? ''} placeholder="product, research, decisions" /></label></div>
      <div className="knowledge-compose__row knowledge-compose__links"><label>Project <span>(optional)</span><select name="projectId" defaultValue={editing?.project?.id ?? ''}><option value="">No linked project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Document <span>(optional)</span><select name="documentId" defaultValue={editing?.document?.id ?? ''}><option value="">No linked document</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label><label>Task <span>(optional)</span><select name="taskId" defaultValue={editing?.task?.id ?? ''}><option value="">No linked task</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label></div>
      <button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save reference'}</button>
    </form>}
    <section className="knowledge-list" aria-label={showArchived ? 'Archived Knowledge items' : 'Knowledge items'}>
      {loading ? <p className="productivity-message">Loading Knowledge…</p> : visibleItems.length === 0 ? <div className="knowledge-empty"><span aria-hidden="true">◇</span><h2>{search ? 'No matching references' : showArchived ? 'Your archive is empty' : 'Start a shared reference library'}</h2><p>{search ? 'Try a different title, note, or tag.' : showArchived ? 'Archived Knowledge items will be available here.' : 'Save decisions, research notes, and links here so the whole workspace can find them.'}</p></div> : <div className="knowledge-grid">{visibleItems.map((item) => <article className="knowledge-card" key={item.id}>
        <div className="knowledge-card__meta"><span>{item.isPinned ? '★ PINNED' : 'REFERENCE'}</span><time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(item.updatedAt))}</time></div>
        <h2>{item.title}</h2><p>{item.content}</p>
        {item.sourceUrl && <a className="knowledge-card__source" href={item.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a>}
        {(item.project || item.document || item.task) && <div className="knowledge-links" aria-label="Linked workspace records">{item.project && <Link href={`/workspace/projects/${item.project.id}`}>Project · {item.project.name}</Link>}{item.document && <Link href={`/workspace/documents/${item.document.id}`}>Document · {item.document.title}</Link>}{item.task && <Link href="/workspace/tasks">Task · {item.task.title}</Link>}</div>}
        {item.tags.length > 0 && <div className="knowledge-tags">{item.tags.map((tag) => <button type="button" key={tag} onClick={() => setSearch(tag)}>#{tag}</button>)}</div>}
        <footer><small>Added by {item.createdBy.displayName} · {item._count.versions} saved {item._count.versions === 1 ? 'version' : 'versions'}</small><div><button type="button" disabled={busy} onClick={() => void toggleHistory(item)}>History</button>{!showArchived && <button type="button" disabled={busy} onClick={() => void updateItem(item, { isPinned: !item.isPinned })}>{item.isPinned ? 'Unpin' : 'Pin'}</button>}<button type="button" disabled={busy} onClick={() => showArchived ? void archiveItem(item) : setEditing(item)}>{showArchived ? 'Restore' : 'Edit'}</button>{!showArchived && <button type="button" disabled={busy} onClick={() => void archiveItem(item)}>Archive</button>}</div></footer>
        {historyId === item.id && <section className="knowledge-history" aria-label={`Version history for ${item.title}`}><h3>Earlier versions</h3>{!versions[item.id] ? <p>Loading history…</p> : versions[item.id].length === 0 ? <p>No earlier versions have been saved yet. Editing this item will create the first snapshot.</p> : versions[item.id].map((version) => <article key={version.id}><div><strong>{version.title}</strong><small>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(version.createdAt))} · {version.createdBy.displayName}</small><p>{version.content}</p></div><button type="button" disabled={busy} onClick={() => void restoreVersion(item, version)}>Restore</button></article>)}</section>}
      </article>)}</div>}
    </section>
  </div>;
}
