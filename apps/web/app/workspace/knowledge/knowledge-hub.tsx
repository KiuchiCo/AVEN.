'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import { useWorkspaceSession } from '../workspace-shell';
import { EmptyState, PageHeader } from '../ui';
import { Icon } from '../home-icons';
import { Modal } from '../projects/project-ui';
import { connectionError, apiFetch } from '../connection-error';

type LinkedRecord = { id: string; name?: string; title?: string };
type KnowledgeItem = { id: string; title: string; content: string; sourceUrl: string | null; tags: string[]; isPinned: boolean; archivedAt: string | null; updatedAt: string; createdBy: { displayName: string }; project: LinkedRecord | null; document: LinkedRecord | null; task: LinkedRecord | null; _count: { versions: number } };
type KnowledgeLinks = { outgoing: { id: string; title: string }[]; unresolved: string[]; backlinks: { id: string; title: string }[] };
type KnowledgeVersion = { id: string; title: string; content: string; sourceUrl: string | null; tags: string[]; createdAt: string; createdBy: { displayName: string }; project: LinkedRecord | null; document: LinkedRecord | null; task: LinkedRecord | null };
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const closeMenu = (button: HTMLElement) => button.closest('details')?.removeAttribute('open');

export function KnowledgeHub() {
  const { getToken } = useAuth();
  const t = useT();
  const { workspace } = useWorkspaceSession();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [projects, setProjects] = useState<LinkedRecord[]>([]);
  const [documents, setDocuments] = useState<LinkedRecord[]>([]);
  const [tasks, setTasks] = useState<LinkedRecord[]>([]);
  const [versions, setVersions] = useState<Record<string, KnowledgeVersion[]>>({});
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [tagDirectory, setTagDirectory] = useState<{ tag: string; count: number }[]>([]);
  const [linksId, setLinksId] = useState<string | null>(null);
  const [linkData, setLinkData] = useState<Record<string, KnowledgeLinks>>({});
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  // The add/edit form opens in a dialog so the library keeps the page.
  const [composerOpen, setComposerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const loadSequence = useRef(0);
  const [error, setError] = useState('');
  const openComposer = (item: KnowledgeItem | null) => { setEditing(item); setError(''); setComposerOpen(true); };
  const closeComposer = () => { setComposerOpen(false); setEditing(null); };

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    if (!token || !apiBase) throw connectionError(token);
    const response = await apiFetch(`${apiBase}${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...options.headers } });
    if (!response.ok) { const body = await response.json().catch(() => null) as { message?: string } | null; throw new Error(body?.message ?? 'AVEN could not complete that request.'); }
    return response.json();
  }, [getToken]);

  const fetchPage = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ archived: String(showArchived), page: String(page) });
    if (debouncedSearch.trim().length >= 2) params.set('q', debouncedSearch.trim());
    if (projectFilter) params.set('projectId', projectFilter);
    if (tagFilter.trim()) params.set('tag', tagFilter.trim());
    return await request(`/workspaces/${workspace.id}/knowledge?${params.toString()}`) as { items: KnowledgeItem[]; total: number; page: number; hasMore: boolean };
  }, [debouncedSearch, projectFilter, request, showArchived, tagFilter, workspace.id]);

  const reload = useCallback(async (page = 1, append = false) => {
    const sequence = ++loadSequence.current;
    if (append) setLoadingMore(true); else setLoading(true);
    setError('');
    try {
      const result = await fetchPage(page);
      if (sequence === loadSequence.current) {
        setItems((current) => append ? [...current, ...result.items] : result.items);
        setHasMore(result.hasMore); setTotal(result.total);
      }
    }
    catch (reason) { if (sequence === loadSequence.current) setError(reason instanceof Error ? reason.message : 'Could not load Knowledge.'); }
    finally { if (sequence === loadSequence.current) { setLoading(false); setLoadingMore(false); } }
  }, [fetchPage]);

  useEffect(() => {
    const sequence = ++loadSequence.current;
    async function load() {
      try {
        const result = await fetchPage();
        if (sequence === loadSequence.current) { setItems(result.items); setHasMore(result.hasMore); setTotal(result.total); }
      } catch (reason) { if (sequence === loadSequence.current) setError(reason instanceof Error ? reason.message : 'Could not load Knowledge.'); }
      finally { if (sequence === loadSequence.current) { setLoading(false); setLoadingMore(false); } }
    }
    void load();
    return () => { if (sequence === loadSequence.current) loadSequence.current += 1; };
  }, [fetchPage]);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 250); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    void Promise.all([
      request(`/workspaces/${workspace.id}/projects`),
      request(`/workspaces/${workspace.id}/documents`),
      request(`/workspaces/${workspace.id}/tasks`),
    ]).then(([projectData, documentData, taskData]) => {
      setProjects(projectData as LinkedRecord[]); setDocuments(documentData as LinkedRecord[]); setTasks(taskData as LinkedRecord[]);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load workspace links.'));
  }, [request, workspace.id]);

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
      setEditing(null); setComposerOpen(false); formElement.reset(); await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('kn.err.save')); }
    finally { setBusy(false); }
  }

  async function updateItem(item: KnowledgeItem, payload: Record<string, unknown>) {
    setBusy(true); setError('');
    try { await request(`/workspaces/${workspace.id}/knowledge/${item.id}`, { method: 'PATCH', body: JSON.stringify(payload) }); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('kn.err.update')); }
    finally { setBusy(false); }
  }

  async function archiveItem(item: KnowledgeItem) {
    setBusy(true); setError('');
    try { await request(`/workspaces/${workspace.id}/knowledge/${item.id}/archive`, { method: 'POST', body: JSON.stringify({ archived: !showArchived }) }); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('kn.err.archive')); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    let live = true;
    void request(`/workspaces/${workspace.id}/knowledge/tags`).then((rows) => { if (live) setTagDirectory(rows as { tag: string; count: number }[]); }).catch(() => undefined);
    return () => { live = false; };
  }, [request, workspace.id, items]);

  async function toggleLinks(item: KnowledgeItem) {
    if (linksId === item.id) { setLinksId(null); return; }
    setLinksId(item.id);
    try { const data = await request(`/workspaces/${workspace.id}/knowledge/${item.id}/links`) as KnowledgeLinks; setLinkData((value) => ({ ...value, [item.id]: data })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('kn.err.links')); }
  }

  async function toggleHistory(item: KnowledgeItem) {
    if (historyId === item.id) { setHistoryId(null); return; }
    setHistoryId(item.id);
    if (versions[item.id]) return;
    try { const history = await request(`/workspaces/${workspace.id}/knowledge/${item.id}/versions`) as KnowledgeVersion[]; setVersions((value) => ({ ...value, [item.id]: history })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('kn.err.history')); }
  }

  async function restoreVersion(item: KnowledgeItem, version: KnowledgeVersion) {
    setBusy(true); setError('');
    try {
      await request(`/workspaces/${workspace.id}/knowledge/${item.id}/versions/${version.id}/restore`, { method: 'POST' });
      setVersions((value) => ({ ...value, [item.id]: [] })); await reload();
      const history = await request(`/workspaces/${workspace.id}/knowledge/${item.id}/versions`) as KnowledgeVersion[];
      setVersions((value) => ({ ...value, [item.id]: history }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('kn.err.restore')); }
    finally { setBusy(false); }
  }

  const pinnedCount = items.filter((item) => item.isPinned).length;
  return <div className="workspace-section-page knowledge-page">
    <PageHeader eyebrow={t('act.eyebrow', { name: workspace.name })} title={t('nav.knowledge')} description={t('kn.desc')}>
      {!showArchived && <button type="button" className="rd-btn" onClick={() => openComposer(null)}><Icon name="plus" size={18} />{t('kn.newItem')}</button>}
    </PageHeader>
    {error && !composerOpen && <p className="productivity-error" role="alert">{error}</p>}
    <div className="knowledge-toolbar"><label className="knowledge-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('kn.searchPh')} />{search.trim().length === 1 && <small>{t('kn.oneMore')}</small>}</label><label className="knowledge-filter">{t('kn.project')}<select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="">{t('kn.allProjects')}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="knowledge-filter">{t('kn.tag')}<input value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} placeholder={t('kn.anyTag')} /></label><div><span>{t(total === 1 ? 'kn.itemOne' : 'kn.itemMany', { n: total })}{!showArchived && t('kn.pinnedOnPage', { n: pinnedCount })}</span><button type="button" aria-pressed={showArchived} onClick={() => { setShowArchived((value) => !value); closeComposer(); setHistoryId(null); }}>{showArchived ? t('kn.viewActive') : t('kn.viewArchive')}</button></div></div>
    {composerOpen && <Modal title={editing ? t('kn.editItem') : t('kn.addItem')} onClose={closeComposer}>
    <form className="productivity-form knowledge-compose" key={editing?.id ?? 'new-knowledge'} onSubmit={save}>
      {error && <p className="productivity-error" role="alert">{error}</p>}
      <label>{t('kn.title')}<input name="title" defaultValue={editing?.title ?? ''} required maxLength={200} placeholder={t('kn.titlePh')} /></label>
      <label>{t('kn.notes')}<textarea name="content" defaultValue={editing?.content ?? ''} required maxLength={20000} rows={6} placeholder={t('kn.notesPh')} /></label>
      <div className="knowledge-compose__row"><label>{t('kn.sourceUrl')} <span>{t('doc.optional')}</span><input name="sourceUrl" type="url" defaultValue={editing?.sourceUrl ?? ''} placeholder="https://…" /></label><label>{t('kn.tags')} <span>{t('kn.commaSeparated')}</span><input name="tags" defaultValue={editing?.tags.join(', ') ?? ''} placeholder={t('kn.tagsPh')} /></label></div>
      <details className="knowledge-compose__more" open={Boolean(editing?.project || editing?.document || editing?.task)}><summary>{t('kn.linkTo')}</summary>
      <div className="knowledge-compose__row knowledge-compose__links"><label>{t('kn.project')} <span>{t('doc.optional')}</span><select name="projectId" defaultValue={editing?.project?.id ?? ''}><option value="">{t('kn.noLinkedProject')}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>{t('kn.document')} <span>{t('doc.optional')}</span><select name="documentId" defaultValue={editing?.document?.id ?? ''}><option value="">{t('kn.noLinkedDocument')}</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label><label>{t('kn.task')} <span>{t('doc.optional')}</span><select name="taskId" defaultValue={editing?.task?.id ?? ''}><option value="">{t('kn.noLinkedTask')}</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label></div>
      </details>
      <div className="pw-actions"><button type="button" className="rd-btn rd-btn--soft" onClick={closeComposer}>{t('msg.cancel')}</button><button type="submit" disabled={busy} aria-busy={busy}>{busy ? t('set.saving') : editing ? t('set.ws.save') : t('kn.saveRef')}</button></div>
    </form>
    </Modal>}
    <div className="knowledge-columns knowledge-columns--single">
    <div className="knowledge-column">
    {tagDirectory.length > 0 && <nav className="knowledge-tag-directory" aria-label={t('kn.tagsNav')}><span>{t('kn.tagsNav')}</span>{tagFilter && <button type="button" onClick={() => setTagFilter('')}>{t('kn.clearFilter')}</button>}{tagDirectory.slice(0, 30).map(({ tag, count }) => <button type="button" key={tag} aria-pressed={tagFilter === tag} className={tagFilter === tag ? 'is-active' : ''} onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}>#{tag} <small>{count}</small></button>)}</nav>}
    <section className="knowledge-list" aria-label={showArchived ? t('kn.listArchived') : t('kn.listActive')}>
      {loading ? <p className="productivity-message">{t('kn.loading')}</p> : items.length === 0 ? <EmptyState art={search || projectFilter || tagFilter ? 'search' : 'stack'} title={search || projectFilter || tagFilter ? t('kn.noMatchTitle') : showArchived ? t('kn.archiveEmptyTitle') : t('kn.startTitle')} text={search || projectFilter || tagFilter ? t('kn.noMatchHint') : showArchived ? t('kn.archiveEmptyHint') : t('kn.startHint')}>{!showArchived && !(search || projectFilter || tagFilter) && <button type="button" className="rd-btn" onClick={() => openComposer(null)}>{t('kn.newItem')}</button>}</EmptyState> : <div className="knowledge-grid">{items.map((item) => <article className="knowledge-card" key={item.id}>
        <div className="knowledge-card__meta"><span>{item.isPinned ? t('kn.pinned') : t('kn.reference')}</span><time>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(item.updatedAt))}</time></div>
        <h2>{item.title}</h2><p>{item.content}</p>
        {item.sourceUrl && <a className="knowledge-card__source" href={item.sourceUrl} target="_blank" rel="noreferrer">{t('kn.openSource')}</a>}
        {(item.project || item.document || item.task) && <div className="knowledge-links" aria-label={t('kn.linkedRecords')}>{item.project && <Link href={`/workspace/projects/${item.project.id}`}>{t('cal.project', { name: item.project.name ?? '' })}</Link>}{item.document && <Link href={`/workspace/documents/${item.document.id}`}>{t('kn.docLink', { name: item.document.title ?? '' })}</Link>}{item.task && <Link href={`/workspace/tasks/${item.task.id}`}>{t('cal.task', { name: item.task.title ?? '' })}</Link>}</div>}
        {item.tags.length > 0 && <div className="knowledge-tags">{item.tags.map((tag) => <button type="button" key={tag} onClick={() => setSearch(tag)}>#{tag}</button>)}</div>}
        <footer><small>{t('kn.addedBy', { name: item.createdBy.displayName })} · {t(item._count.versions === 1 ? 'kn.versionOne' : 'kn.versionMany', { n: item._count.versions })}</small><div><button type="button" disabled={busy} onClick={() => showArchived ? void archiveItem(item) : openComposer(item)}>{showArchived ? t('file.restore') : t('cal.edit')}</button><details className="rd-menu"><summary className="rd-iconbtn" aria-label={t('kn.moreFor', { title: item.title })}><Icon name="more" size={18} /></summary><div className="rd-menu__list"><button type="button" disabled={busy} onClick={(event) => { closeMenu(event.currentTarget); void toggleHistory(item); }}>{t('kn.history')}</button><button type="button" disabled={busy} onClick={(event) => { closeMenu(event.currentTarget); void toggleLinks(item); }}>{t('kn.links')}</button>{!showArchived && <button type="button" disabled={busy} onClick={(event) => { closeMenu(event.currentTarget); void updateItem(item, { isPinned: !item.isPinned }); }}>{item.isPinned ? t('kn.unpin') : t('kn.pin')}</button>}{!showArchived && <button type="button" disabled={busy} onClick={(event) => { closeMenu(event.currentTarget); void archiveItem(item); }}>{t('kn.archive')}</button>}</div></details></div></footer>
        {historyId === item.id && <section className="knowledge-history" aria-label={t('kn.historyFor', { title: item.title })}><h3>{t('kn.earlier')}</h3>{!versions[item.id] ? <p>{t('kn.loadingHistory')}</p> : versions[item.id].length === 0 ? <p>{t('kn.noEarlier')}</p> : versions[item.id].map((version) => <article key={version.id}><div><strong>{version.title}</strong><small>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(version.createdAt))} · {version.createdBy.displayName}</small><p>{version.content}</p></div><button type="button" disabled={busy} onClick={() => void restoreVersion(item, version)}>{t('file.restore')}</button></article>)}</section>}
        {linksId === item.id && <section className="knowledge-link-panel" aria-label={t('kn.linksFor', { title: item.title })}>{!linkData[item.id] ? <p>{t('kn.loadingLinks')}</p> : <>
          <div><h3>{t('kn.linksTo')}</h3>{linkData[item.id].outgoing.length === 0 && linkData[item.id].unresolved.length === 0 ? <p>{t('kn.linksNowhere')}</p> : <ul>{linkData[item.id].outgoing.map((link) => <li key={link.id}><button type="button" onClick={() => { setSearch(link.title); setLinksId(null); }}>{link.title}</button></li>)}{linkData[item.id].unresolved.map((title) => <li key={title} className="is-unresolved">{title} <small>{t('kn.noItemTitled')}</small></li>)}</ul>}</div>
          <div><h3>{t('kn.linkedFrom')}</h3>{linkData[item.id].backlinks.length === 0 ? <p>{t('kn.nothingLinks')}</p> : <ul>{linkData[item.id].backlinks.map((link) => <li key={link.id}><button type="button" onClick={() => { setSearch(link.title); setLinksId(null); }}>{link.title}</button></li>)}</ul>}</div>
        </>}</section>}
      </article>)}</div>}
      {!loading && hasMore && <button type="button" className="knowledge-load-more" disabled={loadingMore} onClick={() => void reload(Math.ceil(items.length / 50) + 1, true)}>{loadingMore ? t('kn.loadingMore') : t('kn.loadMore')}</button>}
    </section>
    </div>
    </div>
  </div>;
}
