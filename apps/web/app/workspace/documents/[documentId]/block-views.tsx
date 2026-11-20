'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../../../i18n';
import type { Key } from '../../../i18n/en';
import { useWorkspaceSession } from '../../workspace-shell';
import { useFilesApi } from '../../files/use-files-api';
import type { FileRecord } from '../../files/types';
import { BlockIcon } from '../../block-icons';
import { safeHref, type DatabaseView } from './editor-model';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

/** A small authenticated GET/POST for the blocks that read workspace data (documents, databases). */
function useWorkspaceApi() {
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  return useCallback(async <T,>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API.');
    const response = await fetch(`${apiBase}/workspaces/${workspace.id}${path}`, { method: init.method ?? 'GET', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    if (!response.ok) throw new Error(body?.message ?? 'AVEN could not complete that request.');
    return body as T;
  }, [getToken, workspace.id]);
}

// ---- Video, audio and file ------------------------------------------------------------------------------------------

const accepts = { VIDEO: /^video\//, AUDIO: /^audio\//, FILE: /./ } as const;
const acceptAttr = { VIDEO: 'video/*', AUDIO: 'audio/*', FILE: '' } as const;

function useStoredUrl(fileId: string | undefined) {
  const files = useFilesApi();
  const [state, setState] = useState<{ id: string; url: string | null; failed: boolean }>({ id: '', url: null, failed: false });
  useEffect(() => {
    if (!fileId) return;
    let live = true; let created: string | null = null;
    void files.fetchBlob(fileId, { inline: true }).then((blob) => { created = URL.createObjectURL(blob); if (live) setState({ id: fileId, url: created, failed: false }); }).catch(() => { if (live) setState({ id: fileId, url: null, failed: true }); });
    return () => { live = false; if (created) URL.revokeObjectURL(created); };
  }, [fileId, files.fetchBlob]); // eslint-disable-line react-hooks/exhaustive-deps -- the files hook returns fresh callbacks each render; the file id is what matters
  return fileId && state.id === fileId ? state : { id: '', url: null, failed: false };
}

export function MediaBlock({ kind, fileId, caption, readOnly, onPick, onCaption }: { kind: 'VIDEO' | 'AUDIO' | 'FILE'; fileId: string | undefined; caption: string; readOnly: boolean; onPick: (file: { id: string; name: string }) => void; onCaption: (text: string) => void }) {
  const t = useT();
  const files = useFilesApi();
  const stored = useStoredUrl(fileId);
  const [choices, setChoices] = useState<FileRecord[] | null>(null);
  const [error, setError] = useState('');
  const word = t(`blk.${kind === 'VIDEO' ? 'video' : kind === 'AUDIO' ? 'audio' : 'file'}` as Key);

  async function browse() {
    setError('');
    try { const listing = await files.call<{ files: FileRecord[] }>(''); setChoices(listing.files.filter((file) => accepts[kind].test(file.mimeType))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load your files.'); }
  }
  async function upload(file: File) {
    setError('');
    if (!accepts[kind].test(file.type || 'application/octet-stream')) { setError(t('bl.badMedia', { kind: word })); return; }
    try { const saved = await files.upload(file); onPick({ id: saved.id, name: saved.name }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not upload that file.'); }
  }
  return <div className="document-media">
    {fileId ? (kind === 'FILE'
      ? <div className="document-media__file"><BlockIcon id="file" size={22} /><strong>{caption || word}</strong><button type="button" onClick={() => void files.download({ id: fileId, name: caption || 'file' }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not download.'))}>{t('bl.download')}</button></div>
      : stored.failed ? <p className="document-image__missing">{t('bl.mediaGone')}</p>
      : !stored.url ? <p className="document-image__missing">{t('bl.imageLoading')}</p>
      : kind === 'VIDEO' ? <video className="document-media__player" src={stored.url} controls preload="metadata" aria-label={caption || word} />
      : <audio className="document-media__audio" src={stored.url} controls preload="metadata" aria-label={caption || word} />)
      : <p className="document-image__missing">{t('bl.noMedia', { kind: word })}</p>}
    {!readOnly && <div className="document-image__actions">
      <label className="files-replace">{t('bl.upload')}<input type="file" accept={acceptAttr[kind]} onChange={(event) => { const next = event.target.files?.[0]; event.target.value = ''; if (next) void upload(next); }} /></label>
      <button type="button" onClick={() => void browse()}>{t('bl.choose')}</button>
    </div>}
    {choices && <ul className="document-image__choices">{choices.length ? choices.map((file) => <li key={file.id}><button type="button" onClick={() => { onPick({ id: file.id, name: file.name }); setChoices(null); }}>{file.name}</button></li>) : <li>{t('bl.noMediaFiles', { kind: word })}</li>}</ul>}
    {error && <p className="workspace-settings-status" role="alert">{error}</p>}
    {kind !== 'FILE' && <input className="document-image__caption" value={caption} readOnly={readOnly} placeholder={t('bl.caption')} maxLength={300} aria-label={t('bl.captionLabel')} onChange={(event) => onCaption(event.target.value)} />}
  </div>;
}

// ---- Web bookmark -----------------------------------------------------------------------------------------------------

export function BookmarkBlock({ url, title, readOnly, onChange }: { url: string; title: string; readOnly: boolean; onChange: (change: { url?: string; text?: string }) => void }) {
  const t = useT();
  const href = safeHref(url);
  let host = '';
  try { host = href ? new URL(href).hostname.replace(/^www\./, '') : ''; } catch { host = ''; }
  return <div className="document-bookmark">
    {href ? <a className="document-bookmark__card" href={href} target="_blank" rel="noopener noreferrer"><BlockIcon id="bookmark" size={22} /><span><strong>{title || host}</strong><small>{href}</small></span></a> : <p className="document-image__missing">{t('bl.noBookmark')}</p>}
    {!readOnly && <div className="document-bookmark__fields">
      <input value={url} placeholder={t('bl.bookmarkUrl')} maxLength={2000} aria-label={t('bl.bookmarkUrl')} onChange={(event) => onChange({ url: event.target.value })} />
      <input value={title} placeholder={t('bl.bookmarkTitle')} maxLength={200} aria-label={t('bl.bookmarkTitle')} onChange={(event) => onChange({ text: event.target.value })} />
    </div>}
    {!readOnly && url && !href && <p className="workspace-settings-status" role="alert">{t('ed.linkInvalid')}</p>}
  </div>;
}

// ---- Links to other pages ---------------------------------------------------------------------------------------------

type DocumentRow = { id: string; title: string };
export function PageLinkBlock({ docId, create, currentId, projectId, readOnly, onPick }: { docId: string | undefined; create: boolean; currentId: string; projectId: string | undefined; readOnly: boolean; onPick: (docId: string) => void }) {
  const t = useT();
  const api = useWorkspaceApi();
  const [rows, setRows] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; void api<DocumentRow[]>('/documents').then((list) => { if (live) setRows(list); }).catch(() => { if (live) setRows([]); }); return () => { live = false; }; }, [api]);
  const target = rows?.find((row) => row.id === docId);
  async function createSubpage() {
    setBusy(true); setError('');
    try { const made = await api<DocumentRow>('/documents', { method: 'POST', body: { title: t('bl.untitledPage'), content: '', ...(projectId ? { projectId } : {}) } }); setRows((current) => [...(current ?? []), made]); onPick(made.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the page.'); }
    finally { setBusy(false); }
  }
  return <div className="document-pagelink">
    {docId ? (target ? <Link className="document-pagelink__row" href={`/workspace/documents/${docId}`}><BlockIcon id="page" size={20} /><strong>{target.title}</strong><span aria-hidden="true">→</span></Link> : <p className="document-image__missing">{rows === null ? t('bl.imageLoading') : t('bl.pageGone')}</p>)
      : readOnly ? <p className="document-image__missing">{t('bl.noPage')}</p>
      : <div className="document-pagelink__pick">
        {create && <button type="button" disabled={busy} onClick={() => void createSubpage()}>{busy ? t('ed.creating') : t('bl.createSubpage')}</button>}
        <select value="" aria-label={t('bl.pickPage')} onChange={(event) => event.target.value && onPick(event.target.value)}><option value="">{t('bl.pickPage')}</option>{(rows ?? []).filter((row) => row.id !== currentId).map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</select>
      </div>}
    {error && <p className="workspace-settings-status" role="alert">{error}</p>}
  </div>;
}

// ---- Table of contents and breadcrumb -----------------------------------------------------------------------------------

export function TocBlock({ headings }: { headings: { id: string; text: string; level: number }[] }) {
  const t = useT();
  return <nav className="document-toc" aria-label={t('blk.table-of-contents')}>
    {headings.length === 0 ? <p className="document-image__missing">{t('ed.outlineEmpty')}</p> : headings.map((heading) => <a key={heading.id} href={`#block-${heading.id}`} style={{ paddingLeft: `${(heading.level - 1) * 14}px` }}>{heading.text}</a>)}
  </nav>;
}

export function BreadcrumbBlock({ crumbs }: { crumbs: string[] }) {
  return <p className="document-breadcrumb">{crumbs.map((crumb, index) => <span key={index}>{index > 0 && <i aria-hidden="true">›</i>}{crumb}</span>)}</p>;
}

// ---- Button (creates a task) ------------------------------------------------------------------------------------------------

export function ButtonBlock({ label, taskTitle, readOnly, running, onLabel, onTaskTitle, onRun }: { label: string; taskTitle: string; readOnly: boolean; running: boolean; onLabel: (text: string) => void; onTaskTitle: (text: string) => void; onRun: () => void }) {
  const t = useT();
  return <div className="document-button">
    <button type="button" className="document-button__run" disabled={running || !taskTitle.trim()} onClick={onRun}><BlockIcon id="button" size={18} />{label || t('blk.button')}</button>
    {!readOnly && <div className="document-bookmark__fields">
      <input value={label} maxLength={80} placeholder={t('bl.buttonLabel')} aria-label={t('bl.buttonLabel')} onChange={(event) => onLabel(event.target.value)} />
      <input value={taskTitle} maxLength={200} placeholder={t('bl.buttonTask')} aria-label={t('bl.buttonTask')} onChange={(event) => onTaskTitle(event.target.value)} />
    </div>}
  </div>;
}

// ---- Database views and charts ------------------------------------------------------------------------------------------------

type Property = { id: string; name: string; type: string };
type DbRecord = { id: string; values: Record<string, unknown> };
type Db = { id: string; name: string; properties: Property[]; records: DbRecord[] };
const viewIcons = { TABLE: 'database-table', BOARD: 'database-board', GALLERY: 'database-gallery', LIST: 'database-list', BAR_V: 'chart-bar-vertical', BAR_H: 'chart-bar-horizontal', DONUT: 'chart-donut', NUMBER: 'chart-number' } as const;
const viewOrder = Object.keys(viewIcons) as DatabaseView[];
const show = (value: unknown) => (Array.isArray(value) ? value.join(', ') : value === null || value === undefined ? '' : typeof value === 'boolean' ? (value ? '✓' : '') : String(value));

/** Records grouped by their status value (or "No status"), in first-seen order. */
export function groupByStatus(database: Pick<Db, 'properties' | 'records'>): { label: string; count: number }[] {
  const status = database.properties.find((property) => property.type === 'status');
  const counts = new Map<string, number>();
  for (const record of database.records) { const label = status ? show(record.values[status.id]) || '—' : '—'; counts.set(label, (counts.get(label) ?? 0) + 1); }
  return [...counts].map(([label, count]) => ({ label, count }));
}

export function DatabaseBlock({ databaseId, view, linked, create, readOnly, onChange }: { databaseId: string | undefined; view: DatabaseView; linked: boolean; create: boolean; readOnly: boolean; onChange: (change: { databaseId?: string; view?: DatabaseView; create?: boolean; linked?: boolean }) => void }) {
  const t = useT();
  const api = useWorkspaceApi();
  const [databases, setDatabases] = useState<Db[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; void api<Db[]>('/databases').then((rows) => { if (live) setDatabases(rows); }).catch((reason) => { if (live) { setDatabases([]); setError(reason instanceof Error ? reason.message : 'Could not load databases.'); } }); return () => { live = false; }; }, [api]);
  const database = databases?.find((item) => item.id === databaseId);
  const groups = useMemo(() => (database ? groupByStatus(database) : []), [database]);
  async function createDatabase() {
    setBusy(true); setError('');
    try { const made = await api<Db>('/databases', { method: 'POST', body: { name: t('bl.newDatabaseName'), description: '' } }); setDatabases((current) => [...(current ?? []), { ...made, records: made.records ?? [] }]); onChange({ databaseId: made.id, create: false }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the database.'); }
    finally { setBusy(false); }
  }
  const titleProperty = database?.properties.find((property) => property.id === 'name') ?? database?.properties[0];
  const total = Math.max(1, ...groups.map((group) => group.count));
  const sum = groups.reduce((all, group) => all + group.count, 0);
  const tones = ['var(--m-focus)', 'var(--m-good)', 'var(--m-info-ink)', 'var(--m-violet-ink)', 'var(--m-warn-ink)', 'var(--m-bad-ink)'];
  return <div className="document-database">
    <div className="document-database__bar">
      <BlockIcon id={viewIcons[view]} size={20} />
      <select value={databaseId ?? ''} disabled={readOnly || !databases} aria-label={t('db.workspaceDb')} onChange={(event) => onChange({ databaseId: event.target.value, create: false })}><option value="">{databases === null ? t('bl.imageLoading') : t('bl.pickDatabase')}</option>{(databases ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={view} disabled={readOnly} aria-label={t('db.layout')} onChange={(event) => onChange({ view: event.target.value as DatabaseView })}>{viewOrder.map((option) => <option key={option} value={option}>{t(`bl.view.${option}` as Key)}</option>)}</select>
      {database && <Link href={`/workspace/databases?db=${database.id}`} className="document-database__open">{t('bl.openDatabase')}</Link>}
      {!readOnly && (create || !databaseId) && <button type="button" disabled={busy} onClick={() => void createDatabase()}>{busy ? t('ed.creating') : t('bl.newDatabase')}</button>}
    </div>
    {error && <p className="workspace-settings-status" role="alert">{error}</p>}
    {!database ? <p className="document-image__missing">{linked ? t('bl.pickLinked') : t('bl.pickDatabaseHint')}</p>
      : view === 'NUMBER' ? <p className="document-database__number"><strong>{database.records.length}</strong><span>{database.name}</span></p>
      : view === 'BAR_V' ? <div className="document-chart document-chart--v" role="img" aria-label={database.name}>{groups.map((group, index) => <div key={group.label}><i style={{ height: `${(group.count / total) * 100}%`, background: tones[index % tones.length] }} /><strong>{group.count}</strong><span>{group.label}</span></div>)}</div>
      : view === 'BAR_H' ? <div className="document-chart document-chart--h" role="img" aria-label={database.name}>{groups.map((group, index) => <div key={group.label}><span>{group.label}</span><b><i style={{ width: `${(group.count / total) * 100}%`, background: tones[index % tones.length] }} /></b><strong>{group.count}</strong></div>)}</div>
      : view === 'DONUT' ? <div className="document-chart document-chart--donut">
        <svg viewBox="0 0 120 120" role="img" aria-label={database.name}><circle cx="60" cy="60" r="44" fill="none" stroke="var(--m-track)" strokeWidth="18" />{(() => { let offset = 0; const circumference = 2 * Math.PI * 44; return groups.map((group, index) => { const length = sum ? (group.count / sum) * circumference : 0; const arc = <circle key={group.label} cx="60" cy="60" r="44" fill="none" stroke={tones[index % tones.length]} strokeWidth="18" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />; offset += length; return arc; }); })()}<text x="60" y="66" textAnchor="middle" fill="currentColor" fontSize="22">{sum}</text></svg>
        <ul>{groups.map((group, index) => <li key={group.label}><i style={{ background: tones[index % tones.length] }} />{group.label}<strong>{group.count}</strong></li>)}</ul></div>
      : view === 'BOARD' ? <div className="document-database__board">{groups.map((group) => <section key={group.label}><h4>{group.label}<span>{group.count}</span></h4>{database.records.filter((record) => (show(record.values[database.properties.find((property) => property.type === 'status')?.id ?? ''] ) || '—') === group.label).map((record) => <article key={record.id}>{show(record.values[titleProperty?.id ?? '']) || t('db.untitled')}</article>)}</section>)}</div>
      : view === 'GALLERY' ? <div className="document-database__gallery">{database.records.map((record) => <article key={record.id}><strong>{show(record.values[titleProperty?.id ?? '']) || t('db.untitled')}</strong>{database.properties.filter((property) => property.id !== titleProperty?.id).slice(0, 3).map((property) => <p key={property.id}><span>{property.name}</span>{show(record.values[property.id])}</p>)}</article>)}</div>
      : view === 'LIST' ? <ul className="document-database__list">{database.records.map((record) => <li key={record.id}><strong>{show(record.values[titleProperty?.id ?? '']) || t('db.untitled')}</strong><span>{database.properties.filter((property) => property.id !== titleProperty?.id).slice(0, 2).map((property) => show(record.values[property.id])).filter(Boolean).join(' · ')}</span></li>)}</ul>
      : <div className="document-table__scroll"><table className="document-database__table"><thead><tr>{database.properties.map((property) => <th key={property.id}>{property.name}</th>)}</tr></thead><tbody>{database.records.map((record) => <tr key={record.id}>{database.properties.map((property) => <td key={property.id}>{show(record.values[property.id])}</td>)}</tr>)}</tbody></table></div>}
    {database && database.records.length === 0 && <p className="document-image__missing">{t('db.addToSee')}</p>}
  </div>;
}

/** "Database - Full page": a database made for this page, shown as a card that opens it. */
export function DatabaseLinkBlock({ databaseId, readOnly, onPick }: { databaseId: string | undefined; readOnly: boolean; onPick: (id: string) => void }) {
  const t = useT();
  const api = useWorkspaceApi();
  const [databases, setDatabases] = useState<Db[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; void api<Db[]>('/databases').then((rows) => { if (live) setDatabases(rows); }).catch(() => { if (live) setDatabases([]); }); return () => { live = false; }; }, [api]);
  const database = databases?.find((item) => item.id === databaseId);
  async function createDatabase() {
    setBusy(true); setError('');
    try { const made = await api<Db>('/databases', { method: 'POST', body: { name: t('bl.newDatabaseName'), description: '' } }); setDatabases((current) => [...(current ?? []), { ...made, records: made.records ?? [] }]); onPick(made.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the database.'); }
    finally { setBusy(false); }
  }
  return <div className="document-pagelink">
    {database ? <Link className="document-pagelink__row" href={`/workspace/databases?db=${database.id}`}><BlockIcon id="database-full-page" size={20} /><strong>{database.name}</strong><span>{t(database.records.length === 1 ? 'db.recordOne' : 'db.recordMany', { n: database.records.length })}</span></Link>
      : readOnly ? <p className="document-image__missing">{t('bl.pickDatabaseHint')}</p>
      : <div className="document-pagelink__pick"><button type="button" disabled={busy} onClick={() => void createDatabase()}>{busy ? t('ed.creating') : t('bl.newDatabase')}</button><select value="" aria-label={t('bl.pickDatabase')} onChange={(event) => event.target.value && onPick(event.target.value)}><option value="">{t('bl.pickDatabase')}</option>{(databases ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
    {error && <p className="workspace-settings-status" role="alert">{error}</p>}
  </div>;
}
