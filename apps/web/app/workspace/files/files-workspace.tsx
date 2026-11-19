'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { formatBytes, type FileListing, type FileRecord, type FileUsage, type FileVersionRecord } from './types';
import { useFilesApi } from './use-files-api';

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const previewable = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain)$/;

export function FilesWorkspace() {
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
        if (usage && file.size > usage.maxFileBytes) throw new Error(`“${file.name}” is larger than the ${formatBytes(usage.maxFileBytes)} limit.`);
        setNotice(`Uploading ${done + 1} of ${files.length}…`);
        await upload(file, { folderId });
        done += 1;
      }
      return `Uploaded ${done} ${done === 1 ? 'file' : 'files'}.`;
    });
  }

  const ask = (message: string, initial = '') => window.prompt(message, initial)?.trim() || null;
  const inFolderView = view === 'files' && debounced.length < 2;
  const quota = usage ? Math.min(100, Math.round((usage.usedBytes / usage.quotaBytes) * 100)) : 0;
  const moveTargets = [
    ...(folderId ? [{ id: '', name: 'All files (top level)' }] : []),
    ...(listing && listing.path.length > 1 ? [{ id: listing.path[listing.path.length - 2].id, name: `Up to ${listing.path[listing.path.length - 2].name}` }] : []),
    ...(listing?.folders ?? []).map((folder) => ({ id: folder.id, name: folder.name })),
  ];

  async function toggleVersions(file: FileRecord) {
    if (versions?.fileId === file.id) { setVersions(null); return; }
    try { setVersions({ fileId: file.id, rows: await call<FileVersionRecord[]>(`/${file.id}/versions`) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load versions.'); }
  }

  return <div className="workspace-section-page files-page">
    <p className="workspace-eyebrow">YOUR WORKSPACE · {workspace.name}</p>
    <h1>Files</h1>
    <p className="workspace-section-page__description">Keep documents, images and references together. Files can be attached to tasks, documents and projects.</p>
    {error && <p className="productivity-error" role="alert">{error}</p>}
    {notice && <p className="files-notice" role="status">{notice}</p>}

    {usage && <div className="files-usage" aria-label="Storage used"><div className="files-usage__bar" role="img" aria-label={`${quota}% of storage used`}><span style={{ width: `${quota}%` }} /></div><small>{formatBytes(usage.usedBytes)} of {formatBytes(usage.quotaBytes)} used · files can be up to {formatBytes(usage.maxFileBytes)}</small></div>}

    <div className="files-toolbar">
      <div className="files-views" role="group" aria-label="View"><button type="button" aria-pressed={view === 'files'} onClick={() => { setView('files'); setVersions(null); }}>Files</button><button type="button" aria-pressed={view === 'bin'} onClick={() => { setView('bin'); setVersions(null); }}>Recycle bin</button></div>
      {view === 'files' && <label className="files-search"><span className="visually-hidden">Search files</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search files and folders…" /></label>}
      {canEdit && view === 'files' && inFolderView && <>
        <label className="files-upload">Upload files<input type="file" multiple disabled={busy} onChange={(event) => { const selected = [...(event.target.files ?? [])]; event.target.value = ''; if (selected.length) void uploadFiles(selected); }} /></label>
        <button type="button" disabled={busy} onClick={() => { const name = ask('Folder name'); if (name) void run(async () => { await call('/folders', { method: 'POST', body: { name, parentId: folderId } }); }); }}>New folder</button>
      </>}
    </div>

    {inFolderView && <nav className="files-path" aria-label="Folder path"><button type="button" onClick={() => setFolderId(null)}>All files</button>{listing?.path.map((part) => <span key={part.id}>›<button type="button" onClick={() => setFolderId(part.id)}>{part.name}</button></span>)}</nav>}

    {!listing ? <p className="productivity-message">Loading files…</p> : <div className="files-table-wrap"><table className="files-table">
      <thead><tr><th>Name</th><th>Size</th><th>{view === 'bin' ? 'Deleted' : 'Modified'}</th><th>By</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
      <tbody>
        {listing.folders.map((folder) => <tr key={folder.id}>
          <td><button type="button" className="files-folder" onClick={() => { setFolderId(folder.id); setSearch(''); }}>▸ {folder.name}</button></td><td>—</td><td>{when.format(new Date(folder.createdAt))}</td><td>—</td>
          <td className="files-actions">{canEdit && inFolderView && <>
            <button type="button" disabled={busy} onClick={() => { const name = ask('Rename folder', folder.name); if (name && name !== folder.name) void run(async () => { await call(`/folders/${folder.id}`, { method: 'PATCH', body: { name } }); }); }}>Rename</button>
            <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Delete the folder “${folder.name}”? It must be empty.`)) void run(async () => { await call(`/folders/${folder.id}`, { method: 'DELETE' }); }); }}>Delete</button>
          </>}</td>
        </tr>)}
        {listing.files.map((file) => <Fragment key={file.id}>
          <tr>
            <td><strong>{file.name}</strong>{file.version > 1 && <span className="task-badge">v{file.version}</span>}</td><td>{formatBytes(file.sizeBytes)}</td><td>{when.format(new Date(file.deletedAt ?? file.updatedAt))}</td><td>{file.createdBy.displayName}</td>
            <td className="files-actions">{view === 'bin' ? (canEdit && <>
              <button type="button" disabled={busy} onClick={() => void run(async () => { await call(`/${file.id}/restore`, { method: 'POST' }); return `Restored “${file.name}”.`; })}>Restore</button>
              <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Permanently delete “${file.name}” and all its versions? This cannot be undone.`)) void run(async () => { await call(`/${file.id}/permanent`, { method: 'DELETE' }); return 'Deleted permanently.'; }); }}>Delete forever</button>
            </>) : <>
              {previewable.test(file.mimeType) && <button type="button" onClick={() => void run(() => preview(file))}>Preview</button>}
              <button type="button" onClick={() => void run(() => download(file))}>Download</button>
              <button type="button" onClick={() => void toggleVersions(file)}>Versions</button>
              {canEdit && <>
                <label className="files-replace">New version<input type="file" disabled={busy} onChange={(event) => { const next = event.target.files?.[0]; event.target.value = ''; if (next) void run(async () => { await upload(next, { replaceFileId: file.id }); return `Saved a new version of “${file.name}”.`; }); }} /></label>
                <button type="button" disabled={busy} onClick={() => { const name = ask('Rename file', file.name); if (name && name !== file.name) void run(async () => { await call(`/${file.id}`, { method: 'PATCH', body: { name } }); }); }}>Rename</button>
                {moveTargets.length > 0 && inFolderView && <select aria-label={`Move ${file.name}`} defaultValue="" disabled={busy} onChange={(event) => { const target = event.target.value; event.target.value = ''; if (target !== '') void run(async () => { await call(`/${file.id}`, { method: 'PATCH', body: { folderId: target === 'root' ? null : target } }); return 'Moved.'; }); }}><option value="" disabled>Move to…</option>{moveTargets.map((target) => <option key={target.id || 'root'} value={target.id || 'root'}>{target.name}</option>)}</select>}
                <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Move “${file.name}” to the recycle bin?`)) void run(async () => { await call(`/${file.id}`, { method: 'DELETE' }); return 'Moved to the recycle bin.'; }); }}>Delete</button>
              </>}
            </>}</td>
          </tr>
          {versions?.fileId === file.id && <tr className="files-versions"><td colSpan={5}><strong>Versions</strong><ul>{versions.rows.map((row) => <li key={row.version}>v{row.version}{row.current ? ' (current)' : ''} · {formatBytes(row.sizeBytes)} · {when.format(new Date(row.createdAt))} · {row.createdBy.displayName} <button type="button" onClick={() => void run(() => download(file, row.version))}>Download</button></li>)}</ul></td></tr>}
        </Fragment>)}
        {listing.folders.length === 0 && listing.files.length === 0 && <tr><td colSpan={5} className="files-empty">{view === 'bin' ? 'The recycle bin is empty. Deleted files stay here until you delete them forever.' : debounced.length >= 2 ? 'Nothing matches that search.' : 'No files yet. Upload a file or create a folder to begin.'}</td></tr>}
      </tbody>
    </table></div>}
  </div>;
}
