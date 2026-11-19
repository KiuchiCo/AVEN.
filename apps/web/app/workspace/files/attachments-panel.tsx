'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatBytes, type AttachmentRecord, type AttachmentTarget, type FileListing } from './types';
import { useFilesApi } from './use-files-api';

/** Files attached to one task, document, or project: download, detach, upload-and-attach, or attach an existing file. */
export function AttachmentsPanel({ target }: { target: AttachmentTarget }) {
  const { call, upload, download, preview, role } = useFilesApi();
  const query = Object.entries(target).map(([key, value]) => `${key}=${value}`).join('&');
  const [items, setItems] = useState<AttachmentRecord[] | null>(null);
  const [library, setLibrary] = useState<FileListing['files']>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canEdit = role !== 'GUEST';

  const load = useCallback(async () => setItems(await call<AttachmentRecord[]>(`/attachments?${query}`)), [call, query]);
  useEffect(() => {
    let live = true;
    void call<AttachmentRecord[]>(`/attachments?${query}`).then((rows) => { if (live) setItems(rows); }).catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : 'Could not load attachments.'); });
    if (canEdit) void call<FileListing>('').then((listing) => { if (live) setLibrary(listing.files); }).catch(() => undefined);
    return () => { live = false; };
  }, [call, canEdit, query]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }

  const attachedIds = new Set((items ?? []).map((item) => item.file.id));
  return <section className="attachments-panel" aria-label="Attachments">
    <div className="attachments-panel__heading"><h2>Files</h2>{canEdit && <label className="attachments-panel__upload">Upload &amp; attach<input type="file" multiple disabled={busy} onChange={(event) => {
      const selected = [...(event.target.files ?? [])]; event.target.value = '';
      void run(async () => { for (const file of selected) { const saved = await upload(file); await call('/attachments', { method: 'POST', body: { fileId: saved.id, ...target } }); } });
    }} /></label>}</div>
    {error && <p className="productivity-error" role="alert">{error}</p>}
    {items === null ? <p className="attachments-panel__empty">Loading files…</p> : items.length === 0 ? <p className="attachments-panel__empty">No files attached yet.</p> : <ul>{items.map(({ id, file }) => <li key={id}>
      <div><strong>{file.name}</strong><small>{formatBytes(file.sizeBytes)} · v{file.version} · {file.createdBy.displayName}</small></div>
      <div className="attachments-panel__actions">
        {/^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain)$/.test(file.mimeType) && <button type="button" onClick={() => void run(() => preview(file))}>Preview</button>}
        <button type="button" onClick={() => void run(() => download(file))}>Download</button>
        {canEdit && <button type="button" disabled={busy} onClick={() => void run(() => call(`/attachments/${id}`, { method: 'DELETE' }))}>Detach</button>}
      </div>
    </li>)}</ul>}
    {canEdit && library.some((file) => !attachedIds.has(file.id)) && <form onSubmit={(event) => {
      event.preventDefault();
      const fileId = String(new FormData(event.currentTarget).get('fileId') ?? '');
      if (fileId) void run(() => call('/attachments', { method: 'POST', body: { fileId, ...target } }));
    }}><select name="fileId" aria-label="Attach an existing file" defaultValue=""><option value="" disabled>Attach an existing file…</option>{library.filter((file) => !attachedIds.has(file.id)).map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</select><button type="submit" disabled={busy}>Attach</button></form>}
  </section>;
}
