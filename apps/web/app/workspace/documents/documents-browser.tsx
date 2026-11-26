'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { Icon } from '../home-icons';
import { useFavourites } from '../favourites';
import { messageOf, useProjectApi } from '../projects/project-api';
import { ConfirmDialog, LoadingBlock, Notice } from '../projects/project-ui';
import { EmptyState, PageHeader, PillTabs } from '../ui';
import { BulkBar, Breadcrumbs, EntryList, ViewSwitcher, type Entry, type MenuAction } from './library-ui';
import { CreateDocumentModal, FiltersPanel, MoveDialog, NameDialog, sortLabel } from './library-dialogs';
import { downloadExport } from './download-export';
import { VIEW_KEY, advancedCount, canBulkDownload, browse, noAdvanced, nextSort, pathLabel, pathTo, readView, type Advanced, type DocRecord, type FolderRecord, type NavFilter, type SortKey } from './library-model';
import { connectionError } from '../connection-error';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? '';
type Dialog = { kind: 'create' } | { kind: 'newFolder' } | { kind: 'renameDoc'; doc: DocRecord } | { kind: 'renameFolder'; folder: FolderRecord } | { kind: 'move'; ids: string[]; folder?: FolderRecord } | { kind: 'deleteDocs'; ids: string[] } | { kind: 'deleteFolder'; folder: FolderRecord };

/** The Documents page: browse, search, filter and organise documents and folders, in a list or a grid. */
export function DocumentsBrowser() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const { getToken } = useAuth();
  const { request, workspace, user } = useProjectApi();
  const favourites = useFavourites();
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [view, setViewState] = useState<'LIST' | 'GRID'>('LIST');
  const [nav, setNav] = useState<NavFilter>('ALL');
  const [query, setQuery] = useState('');
  const [advanced, setAdvanced] = useState<Advanced>(noAdvanced);
  const [sort, setSort] = useState<SortKey>('UPDATED');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const reload = useCallback(async () => {
    const [docRows, folderRows, projectRows] = await Promise.all([request<DocRecord[]>('/documents'), request<FolderRecord[]>('/documents/folders'), request<{ id: string; name: string }[]>('/projects')]);
    setDocs(docRows); setFolders(folderRows); setProjects(projectRows);
  }, [request]);
  useEffect(() => {
    let live = true;
    void (async () => {
      try { await reload(); const saved = readView(window.localStorage.getItem(VIEW_KEY(workspace.id))); if (live && saved) setViewState(saved); }
      catch (reason) { if (live) setError(messageOf(reason, 'Could not load documents.')); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [reload, t, workspace.id]);

  const setView = (next: 'LIST' | 'GRID') => { setViewState(next); try { window.localStorage.setItem(VIEW_KEY(workspace.id), next); } catch { /* the choice just is not remembered */ } };
  const folderParam = params.get('folder');
  const folderId = folderParam && folders.some((folder) => folder.id === folderParam) ? folderParam : null;
  const path = useMemo(() => pathTo(folders, folderId), [folders, folderId]);
  const current = path[path.length - 1] ?? null;
  const favouriteIds = useMemo(() => new Set((favourites?.items ?? []).filter((item) => item.kind === 'DOCUMENT').map((item) => item.entityId)), [favourites?.items]);
  const result = useMemo(() => browse({ docs, folders, nav, folderId, query, advanced, sort, favouriteIds, meId: user.id, now: nowMs }), [docs, folders, nav, folderId, query, advanced, sort, favouriteIds, user.id, nowMs]);
  const owners = useMemo(() => [...new Map(docs.filter((doc) => doc.createdBy).map((doc) => [doc.createdBy!.id, doc.createdBy!.displayName])).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)), [docs]);
  const locations = useMemo(() => new Map(result.flat ? result.docs.filter((doc) => doc.folderId).map((doc) => [doc.id, pathLabel(folders, doc.folderId)]) : []), [result, folders]);
  const entries: Entry[] = [...result.folders.map((folder) => ({ kind: 'folder' as const, folder })), ...(nav === 'PROJECT' ? [] : result.docs.map((doc) => ({ kind: 'doc' as const, doc })))];
  const itemCount = folderId ? docs.filter((doc) => doc.folderId === folderId).length + folders.filter((folder) => folder.parentId === folderId).length : docs.length;
  const filtering = Boolean(query.trim()) || advancedCount(advanced) > 0 || nav !== 'ALL';

  const openFolder = (id: string | null) => { setSelected(new Set()); setQuery(''); setAdvanced(noAdvanced); setNav('ALL'); router.push(id ? `/workspace/documents?folder=${id}` : '/workspace/documents'); };
  const flash = (message: string) => { setError(''); setNotice(message); };
  const fail = (reason: unknown) => { setNotice(''); setError(messageOf(reason, t('dl.actionFailed'))); };
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); setNotice(''); try { await action(); } catch (reason) { fail(reason); } finally { setBusy(false); } }

  async function moveDocs(ids: string[], destination: string | null) {
    await request('/documents/bulk', { method: 'POST', body: JSON.stringify({ action: 'move', documentIds: ids, folderId: destination }) });
    await reload(); setSelected(new Set());
    flash(t('dl.moved', { where: destination ? pathLabel(folders, destination) : t('nav.documents') }));
  }
  async function moveFolder(folder: FolderRecord, destination: string | null) {
    await request(`/documents/folders/${folder.id}`, { method: 'PATCH', body: JSON.stringify({ parentId: destination }) });
    await reload(); flash(t('dl.folderMoved', { name: folder.name }));
  }
  const dropDocs = (destination: string | null, ids: string[]) => void run(() => moveDocs(ids, destination));
  const descendants = (id: string): string[] => [id, ...folders.filter((folder) => folder.parentId === id).flatMap((folder) => descendants(folder.id))];

  async function exportDoc(doc: DocRecord, format: 'pdf' | 'docx') {
    const token = await getToken();
    if (!token || !apiBase) throw connectionError(token);
    const name = await downloadExport({ apiBase, workspaceId: workspace.id, documentId: doc.id, title: doc.title, format, token });
    flash(t('ed.exported', { name }));
  }
  async function toggleFavourite(doc: DocRecord) { const message = await favourites?.toggle('DOCUMENT', doc.id); if (message) fail(new Error(message)); }

  const menuFor = (entry: Entry): MenuAction[] => {
    if (entry.kind === 'folder') {
      const { folder } = entry;
      return [
        { key: 'open', label: t('doc.open'), icon: 'folder', onSelect: () => openFolder(folder.id) },
        { key: 'rename', label: t('dl.rename'), icon: 'edit', onSelect: () => setDialog({ kind: 'renameFolder', folder }) },
        { key: 'move', label: t('dl.moveToFolder'), icon: 'folder', onSelect: () => setDialog({ kind: 'move', ids: [], folder }) },
        { key: 'delete', label: t('dl.deleteFolder'), icon: 'trash', danger: true, onSelect: () => setDialog({ kind: 'deleteFolder', folder }) },
      ];
    }
    const { doc } = entry; const pinned = favouriteIds.has(doc.id);
    return [
      { key: 'open', label: t('doc.open'), icon: 'doc', onSelect: () => router.push(`/workspace/documents/${doc.id}`) },
      { key: 'rename', label: t('dl.rename'), icon: 'edit', onSelect: () => setDialog({ kind: 'renameDoc', doc }) },
      { key: 'move', label: t('dl.moveToFolder'), icon: 'folder', onSelect: () => setDialog({ kind: 'move', ids: [doc.id] }) },
      { key: 'duplicate', label: t('dl.duplicate'), icon: 'copy', onSelect: () => void run(async () => { const copy = await request<DocRecord>(`/documents/${doc.id}/duplicate`, { method: 'POST' }); await reload(); flash(t('dl.duplicated', { title: copy.title })); }) },
      { key: 'favourite', label: pinned ? t('dl.removeFavourite') : t('dl.addFavourite'), icon: 'star', onSelect: () => void toggleFavourite(doc) },
      { key: 'download', label: t('dl.downloadWord'), icon: 'download', onSelect: () => void run(() => exportDoc(doc, 'docx')) },
      { key: 'export', label: t('dl.exportPdf'), icon: 'upload', onSelect: () => void run(() => exportDoc(doc, 'pdf')) },
      { key: 'share', label: t('dl.share'), icon: 'send', onSelect: () => router.push(`/workspace/documents/${doc.id}?panel=share`) },
      { key: 'delete', label: t('file.delete'), icon: 'trash', danger: true, onSelect: () => setDialog({ kind: 'deleteDocs', ids: [doc.id] }) },
    ];
  };

  const selectedDocs = docs.filter((doc) => selected.has(doc.id));
  const sortKeys: SortKey[] = ['UPDATED', 'CREATED', 'NAME_ASC', 'NAME_DESC', 'OLDEST'];
  const title = current ? current.name : t('nav.documents');

  return <div className="pw-page dl-page">
    <PageHeader eyebrow={t('act.eyebrow', { name: workspace.name })} title={title} description={current ? (itemCount === 1 ? t('dl.itemOne') : t('dl.folderCount', { n: itemCount })) : t('doc.desc')}>
      <button type="button" className="rd-btn" onClick={() => setDialog({ kind: 'create' })}><Icon name="plus" size={18} />{t('dl.create')}</button>
    </PageHeader>
    {current && <Breadcrumbs path={path} onOpen={openFolder} onDropDocs={dropDocs} />}
    {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
    {notice && <Notice kind="success" onClose={() => setNotice('')}>{notice}</Notice>}

    <div className="dl-controls">
      <PillTabs size="small" label={t('doc.filterAria')} value={nav} onChange={(next) => { setNav(next); setSelected(new Set()); }} items={[{ key: 'ALL', label: t('doc.f.all'), icon: 'doc' }, { key: 'RECENT', label: t('doc.f.recent'), icon: 'clock' }, { key: 'FAVOURITES', label: t('doc.f.favourites'), icon: 'star' }, { key: 'PROJECT', label: t('doc.f.project'), icon: 'layers' }, { key: 'MINE', label: t('dl.mine'), icon: 'users' }, { key: 'SHARED', label: t('dl.shared'), icon: 'send' }]} />
    </div>
    <div className="pw-toolbar dl-toolbar">
      <label className="pw-search"><Icon name="search" size={16} /><span className="visually-hidden">{t('dl.search')}</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(new Set()); }} placeholder={t('dl.searchPh')} /></label>
      <FiltersPanel count={advancedCount(advanced)} advanced={advanced} sort={sort} projects={projects} owners={owners} onApply={(next, nextSort2) => { setAdvanced(next); setSort(nextSort2); setSelected(new Set()); }} />
      <label className="pw-sort"><span className="visually-hidden">{t('pj.sort')}</span><select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>{(sortKeys.includes(sort) ? sortKeys : [...sortKeys, sort]).map((key) => <option key={key} value={key}>{t(sortLabel(key))}</option>)}</select></label>
      <button type="button" className="rd-btn rd-btn--soft" onClick={() => setDialog({ kind: 'newFolder' })}><Icon name="plus" size={18} /><span>{t('dl.newFolder')}</span></button>
      <ViewSwitcher value={view} onChange={setView} />
    </div>

    {selected.size > 0 && <BulkBar count={selected.size} canDownload={canBulkDownload(selected.size)} onClear={() => setSelected(new Set())} onMove={() => setDialog({ kind: 'move', ids: [...selected] })} onDelete={() => setDialog({ kind: 'deleteDocs', ids: [...selected] })}
      onFavourite={() => void run(async () => { for (const doc of selectedDocs) if (!favouriteIds.has(doc.id)) { const message = await favourites?.toggle('DOCUMENT', doc.id); if (message) throw new Error(message); } flash(selectedDocs.length === 1 ? t('dl.favouriteAddedOne') : t('dl.favouritesAdded', { n: selectedDocs.length })); })}
      onDownload={() => void run(async () => { for (const doc of selectedDocs) { await exportDoc(doc, 'docx'); await new Promise((resolve) => window.setTimeout(resolve, 400)); } })} />}

    {loading ? <LoadingBlock rows={4} label={t('doc.loading')} />
      : docs.length === 0 && folders.length === 0 ? <EmptyState art="stack" title={t('doc.empty')} text={t('dl.emptyText')}><button type="button" className="rd-btn" onClick={() => setDialog({ kind: 'create' })}><Icon name="plus" size={18} />{t('dl.create')}</button></EmptyState>
        : entries.length === 0 && nav !== 'PROJECT' ? (filtering ? <EmptyState art="search" title={t('doc.noMatch')} text={t('dl.noMatchText')}><button type="button" className="rd-btn rd-btn--soft" onClick={() => { setQuery(''); setAdvanced(noAdvanced); setNav('ALL'); }}>{t('pj.clearFilters')}</button></EmptyState>
          : <EmptyState art="folder" title={t('dl.emptyFolder')} text={t('dl.emptyFolderText')}><button type="button" className="rd-btn" onClick={() => setDialog({ kind: 'create' })}><Icon name="plus" size={18} />{t('dl.create')}</button></EmptyState>)
          : nav === 'PROJECT' ? (result.sections.length === 0 ? <EmptyState art="search" title={t('doc.noMatch')} /> : <div className="dl-sections">{result.sections.map((section) => <section key={section.key}><h3 className="dl-subhead">{section.title ?? t('doc.noProject')}</h3>
            <EntryList layout={view} entries={section.docs.map((doc) => ({ kind: 'doc' as const, doc }))} selected={selected} locations={locations} sort={sort} onSort={(column) => setSort(nextSort(sort, column))} onToggle={(id, on) => setSelected((previous) => { const next = new Set(previous); if (on) next.add(id); else next.delete(id); return next; })} onToggleAll={(on) => setSelected(on ? new Set(section.docs.map((doc) => doc.id)) : new Set())} onOpenFolder={openFolder} menuFor={menuFor} onDropDocs={dropDocs} dragIds={(id) => selected.has(id) ? [...selected] : [id]} /></section>)}</div>)
            : <EntryList layout={view} entries={entries} selected={selected} locations={locations} sort={sort} onSort={(column) => setSort(nextSort(sort, column))}
              onToggle={(id, on) => setSelected((previous) => { const next = new Set(previous); if (on) next.add(id); else next.delete(id); return next; })} onToggleAll={(on) => setSelected(on ? new Set(result.docs.map((doc) => doc.id)) : new Set())}
              onOpenFolder={openFolder} menuFor={menuFor} onDropDocs={dropDocs} dragIds={(id) => selected.has(id) ? [...selected] : [id]} />}
    {result.flat && !loading && filtering && entries.length > 0 && <p className="pw-muted dl-flatnote">{t('dl.flatNote')}</p>}

    {dialog?.kind === 'create' && <CreateDocumentModal projects={projects} folders={folders} folderId={folderId} onClose={() => setDialog(null)} />}
    {dialog?.kind === 'newFolder' && <NameDialog title={t('dl.newFolder')} label={t('dl.folderName')} confirm={t('dl.createFolder')} onClose={() => setDialog(null)} onSubmit={async (name) => { await request('/documents/folders', { method: 'POST', body: JSON.stringify({ name, parentId: folderId }) }); await reload(); flash(t('dl.folderCreated', { name })); }} />}
    {dialog?.kind === 'renameFolder' && <NameDialog title={t('dl.renameFolder')} label={t('dl.folderName')} initial={dialog.folder.name} confirm={t('pw.saveChanges')} onClose={() => setDialog(null)} onSubmit={async (name) => { await request(`/documents/folders/${dialog.folder.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }); await reload(); flash(t('dl.renamed', { name })); }} />}
    {dialog?.kind === 'renameDoc' && <NameDialog title={t('dl.renameDoc')} label={t('doc.title')} initial={dialog.doc.title} confirm={t('pw.saveChanges')} onClose={() => setDialog(null)} onSubmit={async (name) => { await request(`/documents/${dialog.doc.id}`, { method: 'PATCH', body: JSON.stringify({ title: name, baseUpdatedAt: dialog.doc.updatedAt, silent: true }) }); await reload(); flash(t('dl.renamed', { name })); }} />}
    {dialog?.kind === 'move' && <MoveDialog title={dialog.folder ? t('dl.moveFolderTitle', { name: dialog.folder.name }) : dialog.ids.length === 1 ? t('dl.moveTitleOne') : t('dl.moveTitle', { n: dialog.ids.length })} folders={folders} exclude={dialog.folder ? descendants(dialog.folder.id) : []} current={dialog.folder ? dialog.folder.parentId : (dialog.ids.length === 1 ? docs.find((doc) => doc.id === dialog.ids[0])?.folderId ?? null : undefined)} onClose={() => setDialog(null)} onMove={async (destination) => { if (dialog.folder) await moveFolder(dialog.folder, destination); else await moveDocs(dialog.ids, destination); }} />}
    {dialog?.kind === 'deleteDocs' && <ConfirmDialog title={dialog.ids.length === 1 ? t('dl.deleteDocTitle') : t('dl.deleteDocsTitle', { n: dialog.ids.length })} confirmLabel={t('file.delete')} busy={busy} onClose={() => setDialog(null)}
      onConfirm={() => void run(async () => { await request('/documents/bulk', { method: 'POST', body: JSON.stringify({ action: 'delete', documentIds: dialog.ids }) }); await reload(); setSelected(new Set()); setDialog(null); flash(dialog.ids.length === 1 ? t('dl.deletedOne') : t('dl.deleted', { n: dialog.ids.length })); })}>{dialog.ids.length === 1 ? t('doc.confirm', { title: docs.find((doc) => doc.id === dialog.ids[0])?.title ?? '' }) : t('dl.deleteDocsBody', { n: dialog.ids.length })}</ConfirmDialog>}
    {dialog?.kind === 'deleteFolder' && <ConfirmDialog title={t('dl.deleteFolderTitle')} confirmLabel={t('dl.deleteFolder')} busy={busy} onClose={() => setDialog(null)}
      onConfirm={() => void run(async () => { const result2 = await request<{ documents: number; folders: number }>(`/documents/folders/${dialog.folder.id}`, { method: 'DELETE' }); if (folderId && descendants(dialog.folder.id).includes(folderId)) router.replace(dialog.folder.parentId ? `/workspace/documents?folder=${dialog.folder.parentId}` : '/workspace/documents'); await reload(); setDialog(null); flash(t('dl.folderDeleted', { name: dialog.folder.name, docs: result2.documents, folders: result2.folders })); })}>{t('dl.deleteFolderBody', { name: dialog.folder.name })}</ConfirmDialog>}
    <p className="visually-hidden" aria-live="polite">{loading ? '' : t('dl.resultCount', { n: entries.length })}</p>
  </div>;
}
