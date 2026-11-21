'use client';

import { useT } from '../../i18n';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { formatBytes, type FileListing, type FileRecord, type FileUsage, type FileVersionRecord } from './types';
import { useFilesApi } from './use-files-api';
import { EmptyState, PageHeader } from '../ui';
import { Icon } from '../home-icons';
import { Breadcrumbs, ItemMenu, ViewSwitcher, type MenuAction } from '../documents/library-ui';
import { NameDialog } from '../documents/library-dialogs';
import { ConfirmDialog } from '../projects/project-ui';
import { MoveTargetDialog } from './files-dialogs';
import type { FolderRecord as FileFolderRecord } from './types';

/** Files AVEN can read as text for the Knowledge Hub: plain text, text-based PDFs, and Word, PowerPoint and Excel files. */
const readableAsText = (file: { name: string; mimeType: string }) => /\.(txt|md|markdown|csv|tsv|json|html?|log|pdf|docx|pptx|xlsx)$/i.test(file.name) || file.mimeType === 'application/pdf' || file.mimeType.startsWith('text/') || file.mimeType === 'application/json';

type Dialog = { kind: 'newFolder' } | { kind: 'renameFolder'; folder: FileFolderRecord } | { kind: 'deleteFolder'; folder: FileFolderRecord } | { kind: 'renameFile'; file: FileRecord } | { kind: 'moveFile'; file: FileRecord } | { kind: 'binFile'; file: FileRecord } | { kind: 'purgeFile'; file: FileRecord };
const LAYOUT_KEY = (workspaceId: string) => `aven.files.view.${workspaceId}`;
const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const previewable = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain)$/;

export function FilesWorkspace() {
  const t = useT();
  const { workspace } = useWorkspaceSession();
  const { call, upload, download, preview, role } = useFilesApi();
  const canEdit = role !== 'GUEST';
  const [folderId, setFolderId] = useState<string | null>(null);
  const [view, setView] = useState<'files' | 'bin'>('files');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [listing, setListing] = useState<FileListing | null>(null);
  const [usage, setUsage] = useState<FileUsage | null>(null);
  const [versions, setVersions] = useState<{ fileId: string; rows: FileVersionRecord[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [layout, setLayout] = useState<'LIST' | 'GRID'>('LIST');
  const [sort, setSort] = useState<'MODIFIED' | 'NAME' | 'SIZE'>('MODIFIED');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<FileRecord | null>(null);

  useEffect(() => { const timer = window.setTimeout(() => setDebounced(search.trim()), 250); return () => window.clearTimeout(timer); }, [search]);

  const path = useCallback(() => {
    if (view === 'bin') return '?deleted=true';
    if (debounced.length >= 2) return `?q=${encodeURIComponent(debounced)}`;
    return folderId ? `?folderId=${folderId}` : '';
  }, [debounced, folderId, view]);

  const load = useCallback(async () => {
    const [rows, used] = await Promise.all([call<FileListing>(path()), call<FileUsage>('/usage')]);
    setListing(rows); setUsage(used);
  }, [call, path]);

  useEffect(() => {
    let live = true;
    void Promise.all([call<FileListing>(path()), call<FileUsage>('/usage')])
      .then(([rows, used]) => { if (live) { setListing(rows); setUsage(used); setError(''); } })
      .catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : 'Could not load files.'); });
    return () => { live = false; };
  }, [call, path]);

  async function run(action: () => Promise<string | void>) {
    setBusy(true); setError(''); setNotice('');
    try { const message = await action(); await load(); if (message) setNotice(message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }

  async function uploadFiles(files: File[]) {
    await run(async () => {
      let done = 0;
      for (const file of files) {
        if (usage && file.size > usage.maxFileBytes) throw new Error(t('file.tooBig', { name: file.name, max: formatBytes(usage.maxFileBytes) }));
        setNotice(t('file.uploading', { i: done + 1, n: files.length }));
        await upload(file, { folderId });
        done += 1;
      }
      return done === 1 ? t('file.uploadedOne') : t('file.uploadedMany', { n: done });
    });
  }

  const inFolderView = view === 'files' && debounced.length < 2;
  const quota = usage?.quotaBytes ? Math.min(100, Math.round((usage.usedBytes / usage.quotaBytes) * 100)) : 0;
  const moveTargets = [
    ...(folderId ? [{ id: '', name: t('file.topLevel') }] : []),
    ...(listing && listing.path.length > 1 ? [{ id: listing.path[listing.path.length - 2].id, name: t('file.upTo', { name: listing.path[listing.path.length - 2].name }) }] : []),
    ...(listing?.folders ?? []).map((folder) => ({ id: folder.id, name: folder.name })),
  ];
  const chooseLayout = (next: 'LIST' | 'GRID') => { setLayout(next); try { window.localStorage.setItem(LAYOUT_KEY(workspace.id), next); } catch { /* not remembered */ } };
  useEffect(() => { let live = true; void Promise.resolve().then(() => { try { const saved = window.localStorage.getItem(LAYOUT_KEY(workspace.id)); if (live && (saved === 'LIST' || saved === 'GRID')) setLayout(saved); } catch { /* ignore */ } }); return () => { live = false; }; }, [workspace.id]);
  const folderMenu = (folder: FileFolderRecord): MenuAction[] => [
    { key: 'rename', label: t('file.rename'), icon: 'edit', onSelect: () => setDialog({ kind: 'renameFolder', folder }) },
    { key: 'delete', label: t('file.delete'), icon: 'trash', danger: true, onSelect: () => setDialog({ kind: 'deleteFolder', folder }) },
  ];
  const fileMenu = (file: FileRecord): MenuAction[] => view === 'bin' ? [
    { key: 'restore', label: t('file.restore'), icon: 'refresh', onSelect: () => void run(async () => { await call(`/${file.id}/restore`, { method: 'POST' }); return t('file.restored', { name: file.name }); }) },
    { key: 'purge', label: t('file.deleteForever'), icon: 'trash', danger: true, onSelect: () => setDialog({ kind: 'purgeFile', file }) },
  ] : [
    { key: 'preview', label: t('file.preview'), icon: 'search', hidden: !previewable.test(file.mimeType), onSelect: () => void run(() => preview(file)) },
    { key: 'download', label: t('file.download'), icon: 'download', onSelect: () => void run(() => download(file)) },
    { key: 'versions', label: t('file.versions'), icon: 'history', onSelect: () => void toggleVersions(file) },
    { key: 'knowledge', label: t('file.toKnowledge'), icon: 'sparkle', hidden: !canEdit || !readableAsText(file), onSelect: () => void run(async () => { const entry = await call<{ truncated: boolean }>(`/${file.id}/knowledge`, { method: 'POST', body: {} }); return entry.truncated ? t('file.addedKnowledgeLong', { name: file.name }) : t('file.addedKnowledge', { name: file.name }); }) },
    { key: 'version', label: t('file.newVersion'), icon: 'upload', hidden: !canEdit, onSelect: () => { replaceTarget.current = file; replaceInput.current?.click(); } },
    { key: 'rename', label: t('file.rename'), icon: 'edit', hidden: !canEdit, onSelect: () => setDialog({ kind: 'renameFile', file }) },
    { key: 'move', label: t('file.moveTo'), icon: 'folder', hidden: !canEdit || moveTargets.length === 0 || !inFolderView, onSelect: () => setDialog({ kind: 'moveFile', file }) },
    { key: 'delete', label: t('file.delete'), icon: 'trash', danger: true, hidden: !canEdit, onSelect: () => setDialog({ kind: 'binFile', file }) },
  ];

  async function toggleVersions(file: FileRecord) {
    if (versions?.fileId === file.id) { setVersions(null); return; }
    try { setVersions({ fileId: file.id, rows: await call<FileVersionRecord[]>(`/${file.id}/versions`) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load versions.'); }
  }

  return <div className="workspace-section-page files-page">
    <PageHeader eyebrow={t('act.eyebrow', { name: workspace.name })} title={t('nav.files')} description={t('file.desc')} />
    {error && <p className="productivity-error" role="alert">{error}</p>}
    {notice && <p className="files-notice" role="status">{notice}</p>}

    {usage && <div className="files-usage" aria-label={t('file.storageAria')}><span className="files-usage__icon"><Icon name="database" size={20} /></span><div className="files-usage__bar" role="img" aria-label={t('file.quotaAria', { n: quota })}><span style={{ width: `${quota}%` }} /></div><small>{usage.quotaBytes === null ? t('file.used', { used: formatBytes(usage.usedBytes) }) : t('file.usedOf', { used: formatBytes(usage.usedBytes), total: formatBytes(usage.quotaBytes) })}{t('file.maxSize', { max: formatBytes(usage.maxFileBytes) })}</small><b className="files-usage__pct">{quota}%</b></div>}

    <div className="files-toolbar">
      <div className="files-views" role="group" aria-label={t('file.viewAria')}><button type="button" aria-pressed={view === 'files'} onClick={() => { setView('files'); setVersions(null); }}><Icon name="folder" size={18} />{t('file.files')}</button><button type="button" aria-pressed={view === 'bin'} onClick={() => { setView('bin'); setVersions(null); }}><Icon name="trash" size={18} />{t('file.bin')}</button></div>
      {view === 'files' && <label className="files-search"><Icon name="search" size={18} /><span className="visually-hidden">{t('file.searchLabel')}</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('file.searchPh')} /></label>}
      {canEdit && view === 'files' && inFolderView && <>
        <label className="files-upload"><Icon name="upload" size={18} />{t('file.upload')}<input type="file" multiple disabled={busy} onChange={(event) => { const selected = [...(event.target.files ?? [])]; event.target.value = ''; if (selected.length) void uploadFiles(selected); }} /></label>
        <button type="button" disabled={busy} onClick={() => setDialog({ kind: 'newFolder' })}><Icon name="folder" size={18} />{t('file.newFolder')}</button>
      </>}
    </div>

    {inFolderView && listing && listing.path.length > 0 && <Breadcrumbs path={listing.path} rootLabel={t('file.allFiles')} onOpen={setFolderId} />}

    {!listing ? <p className="productivity-message">{t('file.loading')}</p> : <div className="files-split">
      <aside className="files-tree" aria-label={t('file.folders')}><header><h2>{t('file.folders')}</h2>{canEdit && view === 'files' && inFolderView && <button type="button" className="rd-iconbtn" aria-label={t('file.newFolder')} disabled={busy} onClick={() => setDialog({ kind: 'newFolder' })}><Icon name="plus" size={18} /></button>}</header>
        <ul><li><button type="button" className={folderId === null && inFolderView ? 'is-active' : ''} onClick={() => { setView('files'); setSearch(''); setFolderId(null); }}><Icon name="folder" size={18} />{t('file.allFiles')}</button>
          <ul>{(inFolderView ? listing.path : []).map((part, depth) => <li key={part.id} style={{ paddingLeft: depth * 14 }}><button type="button" className={part.id === folderId ? 'is-active' : ''} onClick={() => setFolderId(part.id)}><Icon name="folder" size={18} />{part.name}</button></li>)}
            {inFolderView && listing.folders.map((folder) => <li key={folder.id} style={{ paddingLeft: (listing.path.length) * 14 }}><button type="button" onClick={() => { setFolderId(folder.id); setSearch(''); }}><Icon name="folder" size={18} />{folder.name}</button></li>)}
            {inFolderView && listing.folders.length === 0 && <li className="rd-muted files-tree__none">{t('file.noSubfolders')}</li>}</ul></li></ul></aside>
      <section className="files-listing"><header><h2>{view === 'bin' ? t('file.listTitleBin') : debounced.length >= 2 ? t('file.listTitleSearch') : (listing.path[listing.path.length - 1]?.name ?? t('file.allFiles'))}</h2>
        <div className="files-listing__tools"><ViewSwitcher value={layout} onChange={chooseLayout} />
          <select className="rd-select" aria-label={t('file.colName')} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="MODIFIED">{t('file.sort', { v: t('file.sort.modified') })}</option><option value="NAME">{t('file.sort', { v: t('file.sort.name') })}</option><option value="SIZE">{t('file.sort', { v: t('file.sort.size') })}</option></select></div></header>
      <div className={`files-table-wrap files-table-wrap--${layout.toLowerCase()}`}><table className="files-table">
      <thead><tr><th>{t('file.colName')}</th><th>{t('file.colSize')}</th><th>{view === 'bin' ? t('file.colDeleted') : t('file.colModified')}</th><th>{t('file.colBy')}</th><th><span className="visually-hidden">{t('file.colActions')}</span></th></tr></thead>
      <tbody>
        {listing.folders.map((folder) => <tr key={folder.id}>
          <td><button type="button" className="files-folder" onClick={() => { setFolderId(folder.id); setSearch(''); }}><Icon name="folder" size={20} />{folder.name}</button></td><td>—</td><td>{when.format(new Date(folder.createdAt))}</td><td>—</td>
          <td className="files-actions">{canEdit && inFolderView && <ItemMenu name={folder.name} actions={folderMenu(folder as unknown as FileFolderRecord)} />}</td>
        </tr>)}
        {[...listing.files].sort((a, b) => sort === 'NAME' ? a.name.localeCompare(b.name) : sort === 'SIZE' ? b.sizeBytes - a.sizeBytes : new Date(b.deletedAt ?? b.updatedAt).getTime() - new Date(a.deletedAt ?? a.updatedAt).getTime()).map((file) => <Fragment key={file.id}>
          <tr>
            <td><span className="files-name"><span className="files-ico"><Icon name={/^image\//.test(file.mimeType) ? 'image' : 'doc'} size={20} /></span><strong>{file.name}</strong></span>{file.version > 1 && <span className="task-badge">v{file.version}</span>}</td><td>{formatBytes(file.sizeBytes)}</td><td>{when.format(new Date(file.deletedAt ?? file.updatedAt))}</td><td>{file.createdBy.displayName}</td>
            <td className="files-actions">{(view === 'bin' ? canEdit : true) && <ItemMenu name={file.name} actions={fileMenu(file)} />}</td>
          </tr>
          {versions?.fileId === file.id && <tr className="files-versions"><td colSpan={5}><strong>{t('file.versions')}</strong><ul>{versions.rows.map((row) => <li key={row.version}>v{row.version}{row.current ? t('file.current') : ''} · {formatBytes(row.sizeBytes)} · {when.format(new Date(row.createdAt))} · {row.createdBy.displayName} <button type="button" onClick={() => void run(() => download(file, row.version))}>{t('file.download')}</button></li>)}</ul></td></tr>}
        </Fragment>)}
        {listing.folders.length === 0 && listing.files.length === 0 && <tr><td colSpan={5} className="files-empty"><EmptyState art={view === 'bin' ? 'stack' : debounced.length >= 2 ? 'search' : 'folder'} compact title={view === 'bin' ? t('file.emptyBin') : debounced.length >= 2 ? t('file.noMatch') : t('file.empty')} /></td></tr>}
      </tbody>
    </table></div></section></div>}
    <input ref={replaceInput} type="file" hidden onChange={(event) => { const next = event.target.files?.[0]; const file = replaceTarget.current; event.target.value = ''; if (next && file) void run(async () => { await upload(next, { replaceFileId: file.id }); return t('file.savedVersion', { name: file.name }); }); }} />
    {dialog?.kind === 'newFolder' && <NameDialog title={t('file.newFolder')} label={t('file.folderName')} confirm={t('file.newFolder')} onClose={() => setDialog(null)} onSubmit={(name) => run(async () => { await call('/folders', { method: 'POST', body: { name, parentId: folderId } }); })} />}
    {dialog?.kind === 'renameFolder' && <NameDialog title={t('file.renameFolder')} label={t('file.folderName')} initial={dialog.folder.name} confirm={t('pw.saveChanges')} onClose={() => setDialog(null)} onSubmit={(name) => run(async () => { await call(`/folders/${dialog.folder.id}`, { method: 'PATCH', body: { name } }); })} />}
    {dialog?.kind === 'renameFile' && <NameDialog title={t('file.renameFile')} label={t('file.colName')} initial={dialog.file.name} confirm={t('pw.saveChanges')} onClose={() => setDialog(null)} onSubmit={(name) => run(async () => { await call(`/${dialog.file.id}`, { method: 'PATCH', body: { name } }); })} />}
    {dialog?.kind === 'moveFile' && <MoveTargetDialog title={t('file.moveAria', { name: dialog.file.name })} targets={moveTargets} onClose={() => setDialog(null)} onMove={(target) => run(async () => { await call(`/${dialog.file.id}`, { method: 'PATCH', body: { folderId: target } }); return t('file.moved'); })} />}
    {dialog?.kind === 'deleteFolder' && <ConfirmDialog title={t('file.delete')} confirmLabel={t('file.delete')} busy={busy} onClose={() => setDialog(null)} onConfirm={() => { const folder = dialog.folder; setDialog(null); void run(async () => { await call(`/folders/${folder.id}`, { method: 'DELETE' }); }); }}>{t('file.deleteFolderConfirm', { name: dialog.folder.name })}</ConfirmDialog>}
    {dialog?.kind === 'binFile' && <ConfirmDialog title={t('file.delete')} confirmLabel={t('file.delete')} danger={false} busy={busy} onClose={() => setDialog(null)} onConfirm={() => { const file = dialog.file; setDialog(null); void run(async () => { await call(`/${file.id}`, { method: 'DELETE' }); return t('file.toBin'); }); }}>{t('file.binConfirm', { name: dialog.file.name })}</ConfirmDialog>}
    {dialog?.kind === 'purgeFile' && <ConfirmDialog title={t('file.deleteForever')} confirmLabel={t('file.deleteForever')} busy={busy} onClose={() => setDialog(null)} onConfirm={() => { const file = dialog.file; setDialog(null); void run(async () => { await call(`/${file.id}/permanent`, { method: 'DELETE' }); return t('file.deletedForever'); }); }}>{t('file.deleteForeverConfirm', { name: dialog.file.name })}</ConfirmDialog>}
  </div>;
}
