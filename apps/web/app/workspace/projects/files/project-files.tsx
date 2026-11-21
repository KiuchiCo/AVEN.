'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../../../i18n';
import type { Key } from '../../../i18n/en';
import { Icon } from '../../home-icons';
import { EmptyState, PillTabs } from '../../ui';
import { useFilesApi } from '../../files/use-files-api';
import { formatBytes, type AttachmentRecord, type FileListing } from '../../files/types';
import { messageOf } from '../project-api';
import { useProject } from '../project-context';
import { ConfirmDialog, LoadingBlock, formatDate } from '../project-ui';
import { canPreview, categoryOf, fileCategories, sortItems, type FileCategory, type FileSort } from './file-model';

type Doc = { id: string; title: string; updatedAt: string; project: { id: string } | null };
type Item = { key: string; kind: 'FILE' | 'DOC'; name: string; sizeBytes: number; updatedAt: string; category: FileCategory; by: string; attachmentId?: string; fileId?: string; mimeType?: string; version?: number };
const categoryLabel: Record<FileCategory, Key> = { DOCUMENTS: 'pw.cat.documents', IMAGES: 'pw.cat.images', MEDIA: 'pw.cat.media', OTHER: 'pw.cat.other' };

/** Everything attached to this project: files from AVEN Files, plus the documents linked to it. Nothing is stored separately. */
export function ProjectFiles() {
  const t = useT();
  const { call, upload, download, preview, role } = useFilesApi();
  const { project, request, fail, say, clear } = useProject();
  const [attachments, setAttachments] = useState<AttachmentRecord[] | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [library, setLibrary] = useState<FileListing['files']>([]);
  const [query, setQuery] = useState(''); const [category, setCategory] = useState<'ALL' | FileCategory>('ALL'); const [sort, setSort] = useState<FileSort>('MODIFIED');
  const [working, setWorking] = useState(false);
  const [removing, setRemoving] = useState<Item | null>(null);
  const canEdit = role !== 'GUEST' && project.status !== 'ARCHIVED';

  const load = useCallback(async () => {
    const [rows, documentRows] = await Promise.all([call<AttachmentRecord[]>(`/attachments?projectId=${project.id}`), request<Doc[]>('/documents')]);
    setAttachments(rows); setDocs(documentRows.filter((doc) => doc.project?.id === project.id));
  }, [call, project.id, request]);
  useEffect(() => {
    let live = true;
    void (async () => {
      try { await load(); } catch (reason) { if (live) fail(reason, 'Could not load the project files.'); }
      if (role !== 'GUEST') { try { const listing = await call<FileListing>(''); if (live) setLibrary(listing.files); } catch { /* the attach list is optional */ } }
    })();
    return () => { live = false; };
  }, [call, fail, load, role]);

  const items = useMemo<Item[]>(() => [
    ...(attachments ?? []).map(({ id, file }): Item => ({ key: id, kind: 'FILE', name: file.name, sizeBytes: file.sizeBytes, updatedAt: file.updatedAt, category: categoryOf(file.mimeType, file.name), by: file.createdBy.displayName, attachmentId: id, fileId: file.id, mimeType: file.mimeType, version: file.version })),
    ...docs.map((doc): Item => ({ key: doc.id, kind: 'DOC', name: doc.title, sizeBytes: 0, updatedAt: doc.updatedAt, category: 'DOCUMENTS', by: '' })),
  ], [attachments, docs]);
  const counts = useMemo(() => Object.fromEntries(fileCategories.map((key) => [key, items.filter((item) => item.category === key).length])) as Record<FileCategory, number>, [items]);
  const needle = query.trim().toLocaleLowerCase();
  const shown = sortItems(items.filter((item) => (category === 'ALL' || item.category === category) && (!needle || item.name.toLocaleLowerCase().includes(needle))), sort);
  const attachedIds = new Set((attachments ?? []).map((row) => row.file.id));
  const attachable = library.filter((file) => !attachedIds.has(file.id));

  async function run(action: () => Promise<unknown>, done?: string) {
    setWorking(true); clear();
    try { await action(); await load(); if (done) say(done); } catch (reason) { fail(new Error(messageOf(reason, 'Something went wrong.')), ''); } finally { setWorking(false); }
  }
  async function uploadAll(files: File[]) {
    await run(async () => { for (const file of files) { const saved = await upload(file); await call('/attachments', { method: 'POST', body: { fileId: saved.id, projectId: project.id } }); } }, t(files.length === 1 ? 'file.uploadedOne' : 'file.uploadedMany', { n: files.length }));
  }

  return <div className="pw-stack">
    <div className="pw-toolbar">
      <PillTabs size="small" label={t('pw.fileCategories')} value={category} onChange={setCategory} items={[{ key: 'ALL', label: t('pw.all'), count: items.length }, ...fileCategories.filter((key) => counts[key] > 0 || category === key).map((key) => ({ key, label: t(categoryLabel[key]), count: counts[key] }))]} />
      <label className="pw-search"><Icon name="search" size={16} /><span className="visually-hidden">{t('file.searchLabel')}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('file.searchPh')} /></label>
      <label className="pw-sort"><span className="visually-hidden">{t('pj.sort')}</span><select value={sort} onChange={(event) => setSort(event.target.value as FileSort)}><option value="MODIFIED">{t('file.sort.modified')}</option><option value="NAME">{t('file.sort.name')}</option><option value="SIZE">{t('file.sort.size')}</option></select></label>
      {canEdit && <label className="rd-btn"><Icon name="upload" size={18} />{t('file.upload')}<input type="file" multiple hidden disabled={working} onChange={(event) => { const picked = [...(event.target.files ?? [])]; event.target.value = ''; if (picked.length) void uploadAll(picked); }} /></label>}
    </div>

    {attachments === null ? <LoadingBlock rows={3} label={t('file.loading')} />
      : items.length === 0 ? <EmptyState art="folder" title={t('pw.noFilesTitle')} text={t('att.none')}>{canEdit && <label className="rd-btn"><Icon name="upload" size={18} />{t('file.upload')}<input type="file" multiple hidden onChange={(event) => { const picked = [...(event.target.files ?? [])]; event.target.value = ''; if (picked.length) void uploadAll(picked); }} /></label>}<Link className="rd-btn rd-btn--soft" href="/workspace/documents">{t('ph.createDoc')}</Link></EmptyState>
        : shown.length === 0 ? <p className="pw-muted">{t('file.noMatch')}</p>
          : <div className="pw-table pw-table--files" role="table" aria-label={t('pw.tab.files')}>
            <div className="pw-table__head" role="row"><span role="columnheader">{t('file.colName')}</span><span role="columnheader">{t('pw.type')}</span><span role="columnheader">{t('file.colSize')}</span><span role="columnheader">{t('file.colModified')}</span><span role="columnheader">{t('file.colBy')}</span><span role="columnheader"><span className="visually-hidden">{t('file.colActions')}</span></span></div>
            {shown.map((item) => <div key={item.key} className="pw-table__row" role="row">
              <span role="cell" className="pw-table__task"><Icon name={item.kind === 'DOC' ? 'doc' : item.category === 'IMAGES' ? 'image' : 'paper'} size={18} />{item.kind === 'DOC' ? <Link href={`/workspace/documents/${item.key}`}>{item.name}</Link> : <strong>{item.name}{item.version && item.version > 1 ? <small> v{item.version}</small> : null}</strong>}</span>
              <span role="cell" data-label={t('pw.type')}>{item.kind === 'DOC' ? t('pw.document') : t(categoryLabel[item.category])}</span>
              <span role="cell" data-label={t('file.colSize')}>{item.kind === 'FILE' ? formatBytes(item.sizeBytes) : '—'}</span>
              <span role="cell" data-label={t('file.colModified')}>{formatDate(item.updatedAt, '')}</span>
              <span role="cell" data-label={t('file.colBy')}>{item.by || '—'}</span>
              <span role="cell" className="pw-table__edit pw-table__actions">
                {item.kind === 'DOC' ? <Link className="rd-btn rd-btn--soft rd-btn--small" href={`/workspace/documents/${item.key}`}>{t('doc.open')}</Link> : <>
                  {item.mimeType && canPreview(item.mimeType) && <button type="button" className="rd-btn rd-btn--soft rd-btn--small" disabled={working} onClick={() => void run(() => preview({ id: item.fileId! }))}>{t('file.preview')}</button>}
                  <button type="button" className="rd-btn rd-btn--soft rd-btn--small" disabled={working} onClick={() => void run(() => download({ id: item.fileId!, name: item.name }))}>{t('file.download')}</button>
                  {canEdit && <button type="button" className="rd-btn rd-btn--soft rd-btn--small pw-btn--danger-soft" disabled={working} onClick={() => setRemoving(item)}>{t('file.delete')}</button>}</>}
              </span>
            </div>)}
          </div>}

    {canEdit && attachable.length > 0 && <form className="pw-inline-form" onSubmit={(event) => { event.preventDefault(); const fileId = String(new FormData(event.currentTarget).get('fileId') ?? ''); event.currentTarget.reset(); if (fileId) void run(() => call('/attachments', { method: 'POST', body: { fileId, projectId: project.id } })); }}>
      <label className="pw-field"><span className="pw-field__label">{t('att.attachExisting')}</span><select name="fileId" defaultValue=""><option value="" disabled>{t('att.attachExistingPh')}</option>{attachable.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</select></label>
      <button type="submit" className="rd-btn rd-btn--soft" disabled={working}>{t('att.attach')}</button>
    </form>}

    {removing && <ConfirmDialog title={t('pw.deleteFileTitle')} confirmLabel={t('file.delete')} busy={working} onConfirm={() => void run(async () => { await call(`/${removing.fileId}`, { method: 'DELETE' }); setRemoving(null); }, t('file.toBin'))} onClose={() => setRemoving(null)}>
      <p>{t('pw.deleteFileBody', { name: removing.name })}</p>
      <p><button type="button" className="pw-link" onClick={() => void run(async () => { await call(`/attachments/${removing.attachmentId}`, { method: 'DELETE' }); setRemoving(null); }, t('pw.detached'))}>{t('att.detach')}</button> <span className="pw-muted">{t('pw.detachHint')}</span></p>
    </ConfirmDialog>}
  </div>;
}
