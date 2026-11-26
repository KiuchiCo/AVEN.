'use client';

import { cellText, cellValue, filterRecords, groupRecords, sortRecords, type Sort } from './table-logic';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../../i18n';
import type { Key } from '../../../i18n/en';
import { useWorkspaceSession } from '../../workspace-shell';
import { useFilesApi } from '../../files/use-files-api';
import type { FileRecord } from '../../files/types';
import { BlockIcon } from '../../block-icons';
import { safeHref, type DatabaseView, type TabPane } from './editor-model';
import { fitMap, parseCoordinate, worldPixel } from './map-math';
import { connectionError, apiFetch } from '../../connection-error';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

/** A small authenticated GET/POST for the blocks that read workspace data (documents, databases). */
function useWorkspaceApi() {
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  return useCallback(async <T,>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
    const token = await getToken();
    if (!token || !apiBase) throw connectionError(token);
    const response = await apiFetch(`${apiBase}/workspaces/${workspace.id}${path}`, { method: init.method ?? 'GET', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
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
type DbRecord = { id: string; values: Record<string, unknown>; updatedAt?: string };
type Db = { recordTotal?: number; id: string; name: string; properties: Property[]; records: DbRecord[] };
const viewIcons = { TABLE: 'database-table', BOARD: 'database-board', GALLERY: 'database-gallery', LIST: 'database-list', BAR_V: 'chart-bar-vertical', BAR_H: 'chart-bar-horizontal', DONUT: 'chart-donut', NUMBER: 'chart-number', MAP: 'database-map', CALENDAR: 'database-calendar', TIMELINE: 'database-timeline', FEED: 'database-feed', DASHBOARD: 'database-dashboard', LINE: 'chart-line' } as const;
const viewOrder = Object.keys(viewIcons) as DatabaseView[];
const show = (value: unknown) => (Array.isArray(value) ? value.join(', ') : value === null || value === undefined ? '' : typeof value === 'boolean' ? (value ? '✓' : '') : String(value));

/** Records grouped by their status value (or "No status"), in first-seen order. */
export function groupByStatus(database: Pick<Db, 'properties' | 'records'>): { label: string; count: number }[] {
  const status = database.properties.find((property) => property.type === 'status');
  const counts = new Map<string, number>();
  for (const record of database.records) { const label = status ? show(record.values[status.id]) || '—' : '—'; counts.set(label, (counts.get(label) ?? 0) + 1); }
  return [...counts].map(([label, count]) => ({ label, count }));
}

const tones = ['var(--m-focus)', 'var(--m-good)', 'var(--m-info-ink)', 'var(--m-violet-ink)', 'var(--m-warn-ink)', 'var(--m-bad-ink)'];
/** A date stored as YYYY-MM-DD (or a full timestamp), read as a local calendar day. Anything else is null. */
export function parseDay(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value); if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
}
/** Records per month (YYYY-MM) for the line chart, in calendar order. */
export function countByMonth(days: Date[]): { month: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const day of days) { const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}`; counts.set(key, (counts.get(key) ?? 0) + 1); }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count }));
}
function MapTile({ src, x, y }: { src: string; x: number; y: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- map tiles are plain remote images positioned by hand
  return <img src={src} alt="" width={256} height={256} loading="lazy" referrerPolicy="origin" style={{ left: x, top: y }} />;
}
/** A map of records with coordinates, drawn from OpenStreetMap tiles. The tiles are the only thing fetched from outside AVEN. */
function TileMap({ points }: { points: { id: string; title: string; lat: number; lng: number }[] }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640); const [zoomShift, setZoomShift] = useState(0); const height = 320;
  useEffect(() => { const node = box.current; if (!node) return; const update = () => setWidth(Math.max(200, Math.round(node.getBoundingClientRect().width))); update(); const observer = new ResizeObserver(update); observer.observe(node); return () => observer.disconnect(); }, []);
  const fit = useMemo(() => fitMap(points, width, height), [points, width]);
  const zoom = Math.max(0, Math.min(18, fit.zoom + zoomShift));
  const centre = useMemo(() => { const factor = 2 ** (zoom - fit.zoom); return { x: fit.cx * factor, y: fit.cy * factor }; }, [fit, zoom]);
  const left = centre.x - width / 2, top = centre.y - height / 2, count = 2 ** zoom;
  const tiles: { key: string; src: string; x: number; y: number }[] = [];
  for (let tx = Math.floor(left / 256); tx <= Math.floor((left + width) / 256); tx += 1) for (let ty = Math.floor(top / 256); ty <= Math.floor((top + height) / 256); ty += 1) if (ty >= 0 && ty < count) tiles.push({ key: `${tx}/${ty}`, src: `https://tile.openstreetmap.org/${zoom}/${((tx % count) + count) % count}/${ty}.png`, x: tx * 256 - left, y: ty * 256 - top });
  return <figure className="document-map">
    <div className="document-map__frame" ref={box} style={{ height }} role="img" aria-label={t('bl.view.MAP')}>
      {tiles.map((tile) => <MapTile key={tile.key} src={tile.src} x={tile.x} y={tile.y} />)}
      {points.map((point) => { const pixel = worldPixel(point.lat, point.lng, zoom); return <span key={point.id} className="document-map__pin" title={point.title} style={{ left: pixel.x - left, top: pixel.y - top }}><i /><b>{point.title}</b></span>; })}
      <div className="document-map__zoom"><button type="button" aria-label={t('bl.zoomIn')} onClick={() => setZoomShift((value) => Math.min(value + 1, 6))}>+</button><button type="button" aria-label={t('bl.zoomOut')} onClick={() => setZoomShift((value) => Math.max(value - 1, -6))}>−</button></div>
    </div>
    <figcaption>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> · {t('bl.mapNote')}</figcaption>
  </figure>;
}

function Donut({ groups, label }: { groups: { label: string; count: number }[]; label: string }) {
  const sum = groups.reduce((all, group) => all + group.count, 0); const circumference = 2 * Math.PI * 44;
  const arcs = groups.map((group, index) => ({ group, index, length: sum ? (group.count / sum) * circumference : 0, offset: groups.slice(0, index).reduce((all, earlier) => all + (sum ? (earlier.count / sum) * circumference : 0), 0) }));
  return <div className="document-chart document-chart--donut">
    <svg viewBox="0 0 120 120" role="img" aria-label={label}><circle cx="60" cy="60" r="44" fill="none" stroke="var(--m-track)" strokeWidth="18" />{arcs.map((arc) => <circle key={arc.group.label} cx="60" cy="60" r="44" fill="none" stroke={tones[arc.index % tones.length]} strokeWidth="18" strokeDasharray={`${arc.length} ${circumference - arc.length}`} strokeDashoffset={-arc.offset} transform="rotate(-90 60 60)" />)}<text x="60" y="66" textAnchor="middle" fill="currentColor" fontSize="22">{sum}</text></svg>
    <ul>{groups.map((group, index) => <li key={group.label}><i style={{ background: tones[index % tones.length] }} />{group.label}<strong>{group.count}</strong></li>)}</ul></div>;
}
function HBars({ groups, label }: { groups: { label: string; count: number }[]; label: string }) {
  const top = Math.max(1, ...groups.map((group) => group.count));
  return <div className="document-chart document-chart--h" role="img" aria-label={label}>{groups.map((group, index) => <div key={group.label}><span>{group.label}</span><b><i style={{ width: `${(group.count / top) * 100}%`, background: tones[index % tones.length] }} /></b><strong>{group.count}</strong></div>)}</div>;
}
function LineChart({ points, label }: { points: { month: string; count: number }[]; label: string }) {
  const width = 320, height = 130, pad = 22; const top = Math.max(1, ...points.map((point) => point.count));
  const x = (index: number) => pad + (points.length > 1 ? (index / (points.length - 1)) * (width - pad * 2) : (width - pad * 2) / 2);
  const y = (count: number) => height - pad - (count / top) * (height - pad * 2);
  return <svg className="document-chart--line" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
    <path d={`M${pad} ${height - pad}H${width - pad}`} stroke="var(--m-border)" fill="none" />
    <path d={points.map((point, index) => `${index ? 'L' : 'M'}${x(index)} ${y(point.count)}`).join(' ')} fill="none" stroke="var(--m-focus)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
    {points.map((point, index) => <g key={point.month}><circle cx={x(index)} cy={y(point.count)} r="3.6" fill="var(--m-focus)" /><text x={x(index)} y={height - 5} textAnchor="middle" fontSize="9" fill="var(--m-muted)">{point.month}</text><text x={x(index)} y={y(point.count) - 8} textAnchor="middle" fontSize="10" fill="currentColor">{point.count}</text></g>)}
  </svg>;
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
  const [draft, setDraft] = useState('');
  /** Adds a record to the real database (the same one the Databases page shows); nothing is copied into the document. */
  /** Saves one edited cell to the real record (shown straight away, put back if the server refuses). */
  async function editCell(record: DbRecord, property: Property, value: string | number | boolean | null) {
    if (!database) return;
    const before = record.values[property.id];
    const apply = (next: unknown) => setDatabases((current) => (current ?? []).map((item) => (item.id === database.id ? { ...item, records: item.records.map((row) => (row.id === record.id ? { ...row, values: { ...row.values, [property.id]: next } } : row)) } : item)));
    apply(value); setError('');
    try {
      const saved = await api<DbRecord>(`/databases/${database.id}/records/${record.id}`, { method: 'PATCH', body: { values: { [property.id]: value }, baseUpdatedAt: record.updatedAt } });
      setDatabases((current) => (current ?? []).map((item) => (item.id === database.id ? { ...item, records: item.records.map((row) => (row.id === record.id ? { ...row, updatedAt: saved.updatedAt ?? row.updatedAt } : row)) } : item)));
    } catch (reason) { apply(before); setError(reason instanceof Error ? reason.message : t('bl.editFailed')); }
  }
  async function addRecord() {
    if (!database || !titleProperty || !draft.trim()) return;
    setBusy(true); setError('');
    try {
      const made = await api<DbRecord>(`/databases/${database.id}/records`, { method: 'POST', body: { values: { [titleProperty.id]: draft.trim() } } });
      setDatabases((current) => (current ?? []).map((item) => (item.id === database.id ? { ...item, records: [...item.records, made] } : item))); setDraft('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('bl.newRecordFailed')); }
    finally { setBusy(false); }
  }
  const total = Math.max(1, ...groups.map((group) => group.count));
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const dateProperty = database?.properties.find((property) => property.type === 'date');
  const dated = useMemo(() => (database && dateProperty ? database.records.map((record) => ({ record, day: parseDay(record.values[dateProperty.id]) })).filter((entry): entry is { record: DbRecord; day: Date } => entry.day !== null) : []), [database, dateProperty]);
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
      : view === 'NUMBER' ? <p className="document-database__number"><strong>{database.recordTotal ?? database.records.length}</strong><span>{database.name}</span></p>
      : view === 'BAR_V' ? <div className="document-chart document-chart--v" role="img" aria-label={database.name}>{groups.map((group, index) => <div key={group.label}><i style={{ height: `${(group.count / total) * 100}%`, background: tones[index % tones.length] }} /><strong>{group.count}</strong><span>{group.label}</span></div>)}</div>
      : view === 'BAR_H' ? <HBars groups={groups} label={database.name} />
      : view === 'DONUT' ? <Donut groups={groups} label={database.name} />
      : view === 'MAP' ? (() => {
        const textProps = database.properties.filter((property) => property.type === 'text');
        const rank = (property: Property) => database.records.filter((record) => parseCoordinate(record.values[property.id])).length + (/loc|coord|place|where|map/i.test(property.name) ? 0.5 : 0);
        const place = [...textProps].sort((a, b) => rank(b) - rank(a))[0];
        const points = place ? database.records.flatMap((record) => { const spot = parseCoordinate(record.values[place.id]); return spot ? [{ id: record.id, title: show(record.values[titleProperty?.id ?? '']) || t('db.untitled'), ...spot }] : []; }) : [];
        return points.length ? <TileMap points={points} /> : <p className="document-image__missing">{t('bl.needLocation')}</p>;
      })()
      : view === 'LINE' ? (dateProperty ? (dated.length ? <LineChart points={countByMonth(dated.map((entry) => entry.day))} label={database.name} /> : <p className="document-image__missing">{t('bl.noDates')}</p>) : <p className="document-image__missing">{t('bl.needDate')}</p>)
      : view === 'DASHBOARD' ? <div className="document-dashboard">
        <p className="document-database__number"><strong>{database.recordTotal ?? database.records.length}</strong><span>{database.name}</span></p>
        <Donut groups={groups} label={database.name} /><HBars groups={groups} label={database.name} />
        <ul className="document-database__list">{database.records.slice(0, 5).map((record) => <li key={record.id}><strong>{show(record.values[titleProperty?.id ?? '']) || t('db.untitled')}</strong><span>{database.properties.filter((property) => property.id !== titleProperty?.id).slice(0, 2).map((property) => show(record.values[property.id])).filter(Boolean).join(' · ')}</span></li>)}</ul></div>
      : view === 'FEED' ? <div className="document-feed">{[...database.records].sort((a, b) => (dateProperty ? String(b.values[dateProperty.id] ?? '').localeCompare(String(a.values[dateProperty.id] ?? '')) : 0)).map((record) => <article key={record.id}><strong>{show(record.values[titleProperty?.id ?? '']) || t('db.untitled')}</strong><dl>{database.properties.filter((property) => property.id !== titleProperty?.id).map((property) => show(record.values[property.id]) ? <div key={property.id}><dt>{property.name}</dt><dd>{show(record.values[property.id])}</dd></div> : null)}</dl></article>)}</div>
      : view === 'CALENDAR' || view === 'TIMELINE' ? (!dateProperty ? <p className="document-image__missing">{t('bl.needDate')}</p> : <div className="document-cal">
        <header><button type="button" aria-label={t('db.prevMonth')} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><strong>{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month)}</strong><button type="button" aria-label={t('db.nextMonth')} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></header>
        {(() => {
          const inMonth = dated.filter((entry) => entry.day.getFullYear() === month.getFullYear() && entry.day.getMonth() === month.getMonth());
          const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
          if (view === 'TIMELINE') return inMonth.length ? <div className="document-timeline">{inMonth.sort((a, b) => a.day.getTime() - b.day.getTime()).map((entry) => <div key={entry.record.id}><span>{show(entry.record.values[titleProperty?.id ?? '']) || t('db.untitled')}</span><b><i style={{ left: `${((entry.day.getDate() - 1) / Math.max(1, days - 1)) * 100}%` }} /></b><time>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(entry.day)}</time></div>)}</div> : <p className="document-image__missing">{t('db.noDated')}</p>;
          const lead = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7; // weeks start on Monday
          const names = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2024, 0, 1 + index)));
          return <div className="document-cal__grid">{names.map((name) => <span key={name} className="document-cal__wd">{name}</span>)}{Array.from({ length: lead }, (_, index) => <i key={`b${index}`} />)}{Array.from({ length: days }, (_, index) => { const day = index + 1; const here = inMonth.filter((entry) => entry.day.getDate() === day); return <div key={day} className={here.length ? 'has-items' : ''}><b>{day}</b>{here.map((entry) => <em key={entry.record.id} title={show(entry.record.values[titleProperty?.id ?? ''])}>{show(entry.record.values[titleProperty?.id ?? '']) || t('db.untitled')}</em>)}</div>; })}</div>;
        })()}
      </div>)
      : view === 'BOARD' ? <div className="document-database__board">{groups.map((group) => <section key={group.label}><h4>{group.label}<span>{group.count}</span></h4>{database.records.filter((record) => (show(record.values[database.properties.find((property) => property.type === 'status')?.id ?? ''] ) || '—') === group.label).map((record) => <article key={record.id}>{show(record.values[titleProperty?.id ?? '']) || t('db.untitled')}</article>)}</section>)}</div>
      : view === 'GALLERY' ? <div className="document-database__gallery">{database.records.map((record) => <article key={record.id}><strong>{show(record.values[titleProperty?.id ?? '']) || t('db.untitled')}</strong>{database.properties.filter((property) => property.id !== titleProperty?.id).slice(0, 3).map((property) => <p key={property.id}><span>{property.name}</span>{show(record.values[property.id])}</p>)}</article>)}</div>
      : view === 'LIST' ? <ul className="document-database__list">{database.records.map((record) => <li key={record.id}><strong>{show(record.values[titleProperty?.id ?? '']) || t('db.untitled')}</strong><span>{database.properties.filter((property) => property.id !== titleProperty?.id).slice(0, 2).map((property) => show(record.values[property.id])).filter(Boolean).join(' · ')}</span></li>)}</ul>
      : <DataTable database={database} readOnly={readOnly} onEdit={(record, property, value) => void editCell(record, property, value)} />}
    {database && database.records.length === 0 && <p className="document-image__missing">{t('db.addToSee')}</p>}
    {database && !readOnly && titleProperty && ['TABLE', 'BOARD', 'GALLERY', 'LIST', 'FEED', 'DASHBOARD'].includes(view) && <form className="document-database__new" onSubmit={(event) => { event.preventDefault(); void addRecord(); }}>
      <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={200} placeholder={t('bl.newRecordPh')} aria-label={t('bl.newRecordPh')} />
      <button type="submit" disabled={!draft.trim() || busy}>{t('bl.addRecord')}</button>
    </form>}
  </div>;
}

/** The table view of a database block: search, sort by a column, group by a column, and edit cells in place. Everything saves to the real records. */
function DataTable({ database, readOnly, onEdit }: { database: Db; readOnly: boolean; onEdit: (record: DbRecord, property: Property, value: string | number | boolean | null) => void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>(null);
  const [group, setGroup] = useState<string | null>(null);
  const shown = useMemo(() => sortRecords(filterRecords(database.records, database.properties, query), database.properties, sort), [database, query, sort]);
  const groups = useMemo(() => groupRecords(shown, group), [shown, group]);
  const statusOptions = (property: Property) => [...new Set(database.records.map((record) => cellText(record.values[property.id])).filter(Boolean))];
  const nextSort = (property: string) => setSort((current) => (current?.property !== property ? { property, direction: 'asc' } : current.direction === 'asc' ? { property, direction: 'desc' } : null));
  const cell = (record: DbRecord, property: Property) => {
    const value = record.values[property.id]; const label = `${property.name}: ${cellText(record.values[database.properties[0]?.id]) || t('db.untitled')}`;
    if (readOnly) return show(value);
    if (property.type === 'checkbox') return <input type="checkbox" checked={value === true} aria-label={label} onChange={(event) => onEdit(record, property, event.target.checked)} />;
    if (property.type === 'status' || property.type === 'select') return <select value={cellText(value)} aria-label={label} onChange={(event) => onEdit(record, property, event.target.value)}><option value="" />{[...new Set([...statusOptions(property), cellText(value)].filter(Boolean))].map((option) => <option key={option} value={option}>{option}</option>)}</select>;
    if (property.type === 'number') return <input type="number" key={`${record.id}:${property.id}:${cellText(value)}`} defaultValue={value === undefined || value === null ? '' : String(value)} aria-label={label} onBlur={(event) => { const next = cellValue('number', event.target.value); if (next !== (value ?? null)) onEdit(record, property, next); }} />;
    if (property.type === 'date') return <input type="date" key={`${record.id}:${property.id}:${cellText(value)}`} defaultValue={typeof value === 'string' ? value.slice(0, 10) : ''} aria-label={label} onBlur={(event) => { if (event.target.value !== (typeof value === 'string' ? value.slice(0, 10) : '')) onEdit(record, property, event.target.value); }} />;
    if (property.type === 'text') return <input type="text" key={`${record.id}:${property.id}:${cellText(value)}`} defaultValue={cellText(value)} aria-label={label} onBlur={(event) => { if (event.target.value !== cellText(value)) onEdit(record, property, event.target.value); }} />;
    return show(value);
  };
  const groupable = database.properties.filter((property) => property.type === 'status' || property.type === 'select' || property.type === 'text' || property.type === 'checkbox');
  return <div className="document-datatable">
    <div className="document-datatable__tools">
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('bl.filterRows')} aria-label={t('bl.filterRows')} />
      <label>{t('bl.groupBy')}<select value={group ?? ''} onChange={(event) => setGroup(event.target.value || null)}><option value="">{t('bl.noGroup')}</option>{groupable.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
      {(query || sort || group) && <button type="button" onClick={() => { setQuery(''); setSort(null); setGroup(null); }}>{t('bl.resetView')}</button>}
      <span role="status">{shown.length === database.records.length ? t('bl.rowCount', { n: shown.length }) : t('bl.rowsShown', { n: shown.length, total: database.records.length })}</span>
    </div>
    <div className="document-table__scroll"><table className="document-database__table">
      <thead><tr>{database.properties.map((property) => <th key={property.id} aria-sort={sort?.property === property.id ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" onClick={() => nextSort(property.id)}>{property.name}{sort?.property === property.id ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>)}</tr></thead>
      {groups.map((part) => <tbody key={part.label || '·'}>
        {group && <tr className="document-datatable__group"><th colSpan={database.properties.length} scope="colgroup">{part.label || t('bl.noValue')} <span>{part.records.length}</span></th></tr>}
        {part.records.map((record) => <tr key={record.id}>{database.properties.map((property) => <td key={property.id}>{cell(record, property)}</td>)}</tr>)}
      </tbody>)}
    </table></div>
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

// ---- Equation and Mermaid previews ------------------------------------------------------------------------------------------

/** Shows the LaTeX in an equation block as typeset maths. KaTeX runs with `trust` off, so nothing in the source can run or link out. */
export function EquationPreview({ source }: { source: string }) {
  const t = useT();
  const [state, setState] = useState<{ html: string; error: boolean }>({ html: '', error: false });
  useEffect(() => {
    let live = true;
    if (!source.trim()) { void Promise.resolve().then(() => { if (live) setState({ html: '', error: false }); }); return () => { live = false; }; }
    void Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([katex]) => {
      if (!live) return;
      try { setState({ html: katex.default.renderToString(source, { displayMode: true, throwOnError: true, trust: false, output: 'htmlAndMathml' }), error: false }); }
      catch { setState({ html: '', error: true }); }
    });
    return () => { live = false; };
  }, [source]);
  if (!source.trim()) return <p className="document-image__missing">{t('bl.equationEmpty')}</p>;
  if (state.error) return <p className="document-image__missing" role="alert">{t('bl.equationError')}</p>;
  return <div className="document-equation" dangerouslySetInnerHTML={{ __html: state.html }} />;
}

/** Draws the diagram in a Mermaid block. Mermaid runs in its strict mode, which sanitises the source and disables click handlers. */
export function MermaidPreview({ source }: { source: string }) {
  const t = useT();
  const [state, setState] = useState<{ svg: string; error: string }>({ svg: '', error: '' });
  useEffect(() => {
    let live = true;
    if (!source.trim()) { void Promise.resolve().then(() => { if (live) setState({ svg: '', error: '' }); }); return () => { live = false; }; }
    const timer = window.setTimeout(() => {
      void import('mermaid').then(async ({ default: mermaid }) => {
        const dark = document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'neutral' });
        try { const { svg } = await mermaid.render(`mermaid-${crypto.randomUUID()}`, source); if (live) setState({ svg, error: '' }); }
        catch (reason) { if (live) setState({ svg: '', error: reason instanceof Error ? reason.message.split('\n')[0] : t('bl.mermaidError') }); }
      });
    }, 400);
    return () => { live = false; window.clearTimeout(timer); };
  }, [source, t]);
  if (!source.trim()) return <p className="document-image__missing">{t('bl.mermaidEmpty')}</p>;
  if (state.error) return <p className="document-image__missing" role="alert">{t('bl.mermaidError')}: {state.error}</p>;
  return <div className="document-mermaid" dangerouslySetInnerHTML={{ __html: state.svg }} />;
}

// ---- Tabs -----------------------------------------------------------------------------------------------------------------------

export function TabsBlock({ tabs, active, readOnly, onActive, onRemove, onChange }: { tabs: TabPane[]; active: number; readOnly: boolean; onActive: (index: number) => void; onRemove: (index: number) => void; onChange: (tabs: TabPane[]) => void }) {
  const t = useT();
  const index = Math.min(active, Math.max(0, tabs.length - 1));
  const set = (position: number, change: Partial<TabPane>) => onChange(tabs.map((tab, i) => (i === position ? { ...tab, ...change } : tab)));
  // The text of a tab is made of ordinary blocks written below this strip (indented under it, one tab at a time); only the names are edited here.
  return <div className="document-tabs">
    <div className="document-tabs__bar" role="tablist" aria-label={t('blk.tabs')}>
      {tabs.map((tab, position) => <button type="button" role="tab" aria-selected={position === index} key={position} className={position === index ? 'is-active' : ''} onClick={() => onActive(position)}>{tab.title || t('bl.tabUntitled', { n: position + 1 })}</button>)}
      {!readOnly && tabs.length < 8 && <button type="button" className="document-tabs__add" aria-label={t('bl.addTab')} onClick={() => { onChange([...tabs, { title: '', body: '' }]); onActive(tabs.length); }}>＋</button>}
    </div>
    {tabs[index] && !readOnly && <div className="document-tabs__pane" role="tabpanel">
      <div className="document-bookmark__fields"><input value={tabs[index].title} maxLength={60} placeholder={t('bl.tabTitle')} aria-label={t('bl.tabTitle')} onChange={(event) => set(index, { title: event.target.value })} />{tabs.length > 1 && <button type="button" onClick={() => { onRemove(index); onChange(tabs.filter((_, i) => i !== index)); }}>{t('bl.removeTab')}</button>}</div>
      <p className="document-image__missing">{t('bl.tabHint')}</p>
    </div>}
  </div>;
}

// ---- Meeting notes ----------------------------------------------------------------------------------------------------------------

type SpeechResultEvent = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
type SpeechRec = { continuous: boolean; interimResults: boolean; lang: string; onresult: ((event: SpeechResultEvent) => void) | null; onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null; start: () => void; stop: () => void };
const speechCtor = (): (new () => SpeechRec) | null => {
  if (typeof window === 'undefined') return null;
  const host = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
};

/** Structured notes for a meeting, with an optional voice recording kept in Files and the follow-ups turned into tasks. There is no automatic transcript. */
export function MeetingBlock({ block, readOnly, running, actionCount, onChange, onHeard, onTasks }: { block: { text: string; date?: string; attendees?: string; fileId?: string }; readOnly: boolean; running: boolean; actionCount: number; onChange: (change: { text?: string; date?: string; attendees?: string; fileId?: string }) => void; onHeard: (lines: string[]) => void; onTasks: () => void }) {
  const t = useT();
  const files = useFilesApi();
  const stored = useStoredUrl(block.fileId);
  const [recording, setRecording] = useState<MediaRecorder | null>(null);
  const [error, setError] = useState('');
  const [transcribe, setTranscribe] = useState(true);
  const [speechOk, setSpeechOk] = useState(false);
  useEffect(() => { let live = true; void Promise.resolve().then(() => { if (live) setSpeechOk(speechCtor() !== null); }); return () => { live = false; }; }, []);
  const listening = useRef<SpeechRec | null>(null);
  function listen() {
    const Recognition = speechCtor(); if (!Recognition) return;
    const recognition = new Recognition();
    recognition.continuous = true; recognition.interimResults = false; recognition.lang = document.documentElement.lang || navigator.language || 'en-US';
    recognition.onresult = (event) => {
      let heard = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) if (event.results[i].isFinal) heard += `${event.results[i][0].transcript.trim()} `;
      if (heard.trim()) onHeard([heard.trim()]); // what is heard becomes a new line of notes below the meeting, in the document itself
    };
    recognition.onerror = (event) => { if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { listening.current = null; setError(t('bl.speechDenied')); } };
    recognition.onend = () => { if (listening.current === recognition) { try { recognition.start(); } catch { listening.current = null; } } }; // the browser stops after a pause, so carry on while recording
    listening.current = recognition;
    try { recognition.start(); } catch { listening.current = null; }
  }
  function stopListening() { const recognition = listening.current; listening.current = null; try { recognition?.stop(); } catch { /* already stopped */ } }
  async function start() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream); const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop()); setRecording(null); stopListening();
        const type = recorder.mimeType || 'audio/webm';
        const file = new File(chunks, `${block.text || t('blk.ai-meeting-notes')} ${block.date ?? ''}.${type.includes('mp4') ? 'm4a' : 'webm'}`.trim(), { type });
        void files.upload(file).then((saved) => onChange({ fileId: saved.id })).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not save the recording.'));
      };
      recorder.start(); setRecording(recorder); if (transcribe && speechOk) listen();
    } catch { setError(t('bl.micDenied')); }
  }
  return <div className="document-meeting">
    <div className="document-bookmark__fields">
      <input value={block.text} readOnly={readOnly} maxLength={160} placeholder={t('bl.meetingTitle')} aria-label={t('bl.meetingTitle')} onChange={(event) => onChange({ text: event.target.value })} />
      <input type="date" value={block.date ?? ''} readOnly={readOnly} aria-label={t('bl.meetingDate')} onChange={(event) => onChange({ date: event.target.value })} />
    </div>
    <input className="document-meeting__wide" value={block.attendees ?? ''} readOnly={readOnly} maxLength={400} placeholder={t('bl.meetingAttendees')} aria-label={t('bl.meetingAttendees')} onChange={(event) => onChange({ attendees: event.target.value })} />
    <div className="document-image__actions">
      {!readOnly && speechOk && !recording && <label className="document-meeting__check"><input type="checkbox" checked={transcribe} onChange={(event) => setTranscribe(event.target.checked)} />{t('bl.transcribe')}</label>}
      {!readOnly && (recording ? <button type="button" onClick={() => recording.stop()}>{t('bl.stopRecording')}</button> : <button type="button" onClick={() => void start()}>{t('bl.record')}</button>)}
      {!readOnly && <button type="button" disabled={running || actionCount === 0} onClick={onTasks}>{t('bl.actionsToTasks', { n: actionCount })}</button>}
    </div>
    {recording && <p className="document-image__missing" role="status">{t('bl.recording')}</p>}
    {!readOnly && <p className="document-image__missing">{t('bl.meetingHint')} {speechOk ? t('bl.transcribeNote') : t('bl.noTranscribe')}</p>}
    {stored.url && <audio className="document-media__audio" src={stored.url} controls preload="metadata" aria-label={t('bl.meetingRecording')} />}
    {error && <p className="workspace-settings-status" role="alert">{error}</p>}
  </div>;
}
