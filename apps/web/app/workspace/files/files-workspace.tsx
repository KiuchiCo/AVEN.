'use client';

import { useT } from '../../i18n';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { formatBytes, type FileListing, type FileRecord, type FileUsage, type FileVersionRecord } from './types';
import { useFilesApi } from './use-files-api';
import { PageHeader } from '../ui';

/** Files AVEN can read as text for the Knowledge Hub: plain text, text-based PDFs, and Word, PowerPoint and Excel files. */
const readableAsText = (file: { name: string; mimeType: string }) => /\.(txt|md|markdown|csv|tsv|json|html?|log|pdf|docx|pptx|xlsx)$/i.test(file.name) || file.mimeType === 'application/pdf' || file.mimeType.startsWith('text/') || file.mimeType === 'application/json';

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

  const ask = (message: string, initial = '') => window.prompt(message, initial)?.trim() || null;
  const inFolderView = view === 'files' && debounced.length < 2;
  const quota = usage?.quotaBytes ? Math.min(100, Math.round((usage.usedBytes / usage.quotaBytes) * 100)) : 0;
  const moveTargets = [
    ...(folderId ? [{ id: '', name: t('file.topLevel') }] : []),
    ...(listing && listing.path.length > 1 ? [{ id: listing.path[listing.path.length - 2].id, name: t('file.upTo', { name: listing.path[listing.path.length - 2].name }) }] : []),
    ...(listing?.folders ?? []).map((folder) => ({ id: folder.id, name: folder.name })),
  ];

  async function toggleVersions(file: FileRecord) {
    if (versions?.fileId === file.id) { setVersions(null); return; }
    try { setVersions({ fileId: file.id, rows: await call<FileVersionRecord[]>(`/${file.id}/versions`) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load versions.'); }
  }

  return <div className="workspace-section-page files-page">
    <PageHeader eyebrow={t('act.eyebrow', { name: workspace.name })} title={t('nav.files')} description={t('file.desc')} icon="folder" />
    {error && <p className="productivity-error" role="alert">{error}</p>}
    {notice && <p className="files-notice" role="status">{notice}</p>}

    {usage && <div className="files-usage" aria-label={t('file.storageAria')}><div className="files-usage__bar" role="img" aria-label={t('file.quotaAria', { n: quota })}><span style={{ width: `${quota}%` }} /></div><small>{usage.quotaBytes === null ? t('file.used', { used: formatBytes(usage.usedBytes) }) : t('file.usedOf', { used: formatBytes(usage.usedBytes), total: formatBytes(usage.quotaBytes) })}{t('file.maxSize', { max: formatBytes(usage.maxFileBytes) })}</small></div>}

    <div className="files-toolbar">
      <div className="files-views" role="group" aria-label={t('file.viewAria')}><button type="button" aria-pressed={view === 'files'} onClick={() => { setView('files'); setVersions(null); }}>{t('file.files')}</button><button type="button" aria-pressed={view === 'bin'} onClick={() => { setView('bin'); setVersions(null); }}>{t('file.bin')}</button></div>
      {view === 'files' && <label className="files-search"><span className="visually-hidden">{t('file.searchLabel')}</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('file.searchPh')} /></label>}
      {canEdit && view === 'files' && inFolderView && <>
        <label className="files-upload">{t('file.upload')}<input type="file" multiple disabled={busy} onChange={(event) => { const selected = [...(event.target.files ?? [])]; event.target.value = ''; if (selected.length) void uploadFiles(selected); }} /></label>
        <button type="button" disabled={busy} onClick={() => { const name = ask(t('file.folderName')); if (name) void run(async () => { await call('/folders', { method: 'POST', body: { name, parentId: folderId } }); }); }}>{t('file.newFolder')}</button>
      </>}
    </div>

    {inFolderView && <nav className="files-path" aria-label={t('file.pathAria')}><button type="button" onClick={() => setFolderId(null)}>{t('file.allFiles')}</button>{listing?.path.map((part) => <span key={part.id}>›<button type="button" onClick={() => setFolderId(part.id)}>{part.name}</button></span>)}</nav>}

    {!listing ? <p className="productivity-message">{t('file.loading')}</p> : <div className="files-table-wrap"><table className="files-table">
      <thead><tr><th>{t('file.colName')}</th><th>{t('file.colSize')}</th><th>{view === 'bin' ? t('file.colDeleted') : t('file.colModified')}</th><th>{t('file.colBy')}</th><th><span className="visually-hidden">{t('file.colActions')}</span></th></tr></thead>
      <tbody>
        {listing.folders.map((folder) => <tr key={folder.id}>
          <td><button type="button" className="files-folder" onClick={() => { setFolderId(folder.id); setSearch(''); }}>▸ {folder.name}</button></td><td>—</td><td>{when.format(new Date(folder.createdAt))}</td><td>—</td>
          <td className="files-actions">{canEdit && inFolderView && <>
            <button type="button" disabled={busy} onClick={() => { const name = ask(t('file.renameFolder'), folder.name); if (name && name !== folder.name) void run(async () => { await call(`/folders/${folder.id}`, { method: 'PATCH', body: { name } }); }); }}>{t('file.rename')}</button>
            <button type="button" disabled={busy} onClick={() => { if (window.confirm(t('file.deleteFolderConfirm', { name: folder.name }))) void run(async () => { await call(`/folders/${folder.id}`, { method: 'DELETE' }); }); }}>{t('file.delete')}</button>
          </>}</td>
        </tr>)}
        {listing.files.map((file) => <Fragment key={file.id}>
          <tr>
            <td><strong>{file.name}</strong>{file.version > 1 && <span className="task-badge">v{file.version}</span>}</td><td>{formatBytes(file.sizeBytes)}</td><td>{when.format(new Date(file.deletedAt ?? file.updatedAt))}</td><td>{file.createdBy.displayName}</td>
            <td className="files-actions">{view === 'bin' ? (canEdit && <>
              <button type="button" disabled={busy} onClick={() => void run(async () => { await call(`/${file.id}/restore`, { method: 'POST' }); return t('file.restored', { name: file.name }); })}>{t('file.restore')}</button>
              <button type="button" disabled={busy} onClick={() => { if (window.confirm(t('file.deleteForeverConfirm', { name: file.name }))) void run(async () => { await call(`/${file.id}/permanent`, { method: 'DELETE' }); return t('file.deletedForever'); }); }}>{t('file.deleteForever')}</button>
            </>) : <>
              {previewable.test(file.mimeType) && <button type="button" onClick={() => void run(() => preview(file))}>{t('file.preview')}</button>}
              <button type="button" onClick={() => void run(() => download(file))}>{t('file.download')}</button>
              <button type="button" onClick={() => void toggleVersions(file)}>{t('file.versions')}</button>
              {canEdit && <>
                {readableAsText(file) && <button type="button" disabled={busy} title={t('file.toKnowledgeTitle')} onClick={() => void run(async () => { const entry = await call<{ truncated: boolean }>(`/${file.id}/knowledge`, { method: 'POST', body: {} }); return entry.truncated ? t('file.addedKnowledgeLong', { name: file.name }) : t('file.addedKnowledge', { name: file.name }); })}>{t('file.toKnowledge')}</button>}
                <label className="files-replace">{t('file.newVersion')}<input type="file" disabled={busy} onChange={(event) => { const next = event.target.files?.[0]; event.target.value = ''; if (next) void run(async () => { await upload(next, { replaceFileId: file.id }); return t('file.savedVersion', { name: file.name }); }); }} /></label>
                <button type="button" disabled={busy} onClick={() => { const name = ask(t('file.renameFile'), file.name); if (name && name !== file.name) void run(async () => { await call(`/${file.id}`, { method: 'PATCH', body: { name } }); }); }}>{t('file.rename')}</button>
                {moveTargets.length > 0 && inFolderView && <select aria-label={t('file.moveAria', { name: file.name })} defaultValue="" disabled={busy} onChange={(event) => { const target = event.target.value; event.target.value = ''; if (target !== '') void run(async () => { await call(`/${file.id}`, { method: 'PATCH', body: { folderId: target === 'root' ? null : target } }); return t('file.moved'); }); }}><option value="" disabled>{t('file.moveTo')}</option>{moveTargets.map((target) => <option key={target.id || 'root'} value={target.id || 'root'}>{target.name}</option>)}</select>}
                <button type="button" disabled={busy} onClick={() => { if (window.confirm(t('file.binConfirm', { name: file.name }))) void run(async () => { await call(`/${file.id}`, { method: 'DELETE' }); return t('file.toBin'); }); }}>{t('file.delete')}</button>
              </>}
            </>}</td>
          </tr>
          {versions?.fileId === file.id && <tr className="files-versions"><td colSpan={5}><strong>{t('file.versions')}</strong><ul>{versions.rows.map((row) => <li key={row.version}>v{row.version}{row.current ? t('file.current') : ''} · {formatBytes(row.sizeBytes)} · {when.format(new Date(row.createdAt))} · {row.createdBy.displayName} <button type="button" onClick={() => void run(() => download(file, row.version))}>{t('file.download')}</button></li>)}</ul></td></tr>}
        </Fragment>)}
        {listing.folders.length === 0 && listing.files.length === 0 && <tr><td colSpan={5} className="files-empty">{view === 'bin' ? t('file.emptyBin') : debounced.length >= 2 ? t('file.noMatch') : t('file.empty')}</td></tr>}
      </tbody>
    </table></div>}
  </div>;
}
