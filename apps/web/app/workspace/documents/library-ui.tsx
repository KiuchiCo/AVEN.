'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/en';
import { Icon, type IconName } from '../home-icons';
import { Avatar } from '../ui';
import { FavouriteStar } from '../favourites';
import { kindIcon, previewText, sortColumn, type DocRecord, type FolderRecord, type SortKey } from './library-model';

export const formatDay = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
/** "2 documents · 1 folder", with the right singular or plural in every language. */
export const countText = (t: (key: Key, values?: Record<string, string | number>) => string, docs: number, folders: number) => `${docs === 1 ? t('dl.docsOne') : t('dl.docsMany', { n: docs })} · ${folders === 1 ? t('dl.foldersOne') : t('dl.foldersMany', { n: folders })}`;
export const kindName = (type: string | null): Key => (type ? `dl.type.${type}` : 'dl.type.OTHER') as Key;

/** Panels that are open right now, oldest first, so a menu opened from inside another menu does not close its parent. */
const openPanels: HTMLDivElement[] = [];

/** A small anchored panel that closes on Escape or an outside click and always stays inside the window. Used for the filter panel and every actions menu. */
export function Popover({ buttonClass, buttonLabel, buttonContent, onOpen, children, label, className = '', align = 'end', keepFocus, buttonTitle, disabled, pressed }: { buttonClass: string; buttonLabel?: string; buttonContent: ReactNode; onOpen?: () => void; children: (close: () => void) => ReactNode; label: string; className?: string; align?: 'start' | 'end'; /** Keeps the caret in the document while the menu opens (toolbars). */ keepFocus?: boolean; buttonTitle?: string; disabled?: boolean; pressed?: boolean }) {
  const [open, setOpen] = useState(false);
  const isMenu = className.includes('dl-menu');
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  const close = useCallback(() => setOpen(false), []);
  useLayoutEffect(() => {
    if (!open || !button.current || !panel.current) return;
    const anchor = button.current.getBoundingClientRect(); const box = panel.current.getBoundingClientRect();
    const margin = 12;
    const left = Math.max(margin, Math.min(align === 'end' ? anchor.right - box.width : anchor.left, window.innerWidth - box.width - margin));
    const below = anchor.bottom + 6; const fits = below + box.height <= window.innerHeight - margin;
    const top = fits ? below : Math.max(margin, anchor.top - box.height - 6);
    setStyle({ position: 'fixed', left, top, maxHeight: `calc(100vh - ${margin * 2}px)`, visibility: 'visible' });
  }, [open, align]);
  useEffect(() => {
    if (!open) return;
    const me = panel.current; if (me) openPanels.push(me);
    const outside = (event: MouseEvent) => { const target = event.target as Node; const child = openPanels.slice(openPanels.indexOf(me as HTMLDivElement) + 1).some((other) => other.contains(target)); if (!child && !panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false); };
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); button.current?.focus(); return; }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const items = [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];
      if (!items.length) return;
      event.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    };
    const away = () => setOpen(false);
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', keys); window.addEventListener('resize', away); window.addEventListener('scroll', away, true);
    panel.current?.querySelector<HTMLElement>('[role="menuitem"], input, select, button')?.focus();
    return () => { const at = openPanels.indexOf(me as HTMLDivElement); if (at >= 0) openPanels.splice(at, 1); document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', keys); window.removeEventListener('resize', away); window.removeEventListener('scroll', away, true); };
  }, [open]);
  return <>
    <button ref={button} type="button" className={buttonClass} aria-haspopup={isMenu ? 'menu' : 'dialog'} aria-expanded={open} aria-pressed={pressed} aria-label={buttonLabel} title={buttonTitle} disabled={disabled} onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined} onClick={(event) => { event.stopPropagation(); if (!open) onOpen?.(); setStyle({ visibility: 'hidden' }); setOpen((value) => !value); }}>{buttonContent}</button>
    {open && createPortal(<div ref={panel} className={`dl-popover ${className}`} style={style} role={isMenu ? 'menu' : 'dialog'} aria-label={label}>{children(close)}</div>, document.body)}
  </>;
}

export type MenuAction = { key: string; label: string; icon: IconName; danger?: boolean; hidden?: boolean; onSelect: () => void };

/** The three-dot menu on every document and folder. Only the actions that apply are listed. */
export function ItemMenu({ name, actions }: { name: string; actions: MenuAction[] }) {
  const t = useT();
  const shown = actions.filter((action) => !action.hidden);
  return <Popover label={t('dl.actionsFor', { name })} className="dl-menu" buttonClass="rd-iconbtn" buttonLabel={t('dl.actionsFor', { name })} buttonContent={<Icon name="more" size={20} />}>
    {(close) => <>{shown.map((action, index) => <div key={action.key} role="none">
      {action.danger && index > 0 && <hr />}
      <button type="button" role="menuitem" className={action.danger ? 'is-danger' : ''} onClick={() => { close(); action.onSelect(); }}><Icon name={action.icon} size={16} />{action.label}</button>
    </div>)}</>}
  </Popover>;
}

export function ViewSwitcher({ value, onChange }: { value: 'LIST' | 'GRID'; onChange: (value: 'LIST' | 'GRID') => void }) {
  const t = useT();
  return <div className="dl-switch" role="group" aria-label={t('dl.viewSwitch')}>{([['LIST', 'list', 'file.layout.list'], ['GRID', 'grid', 'file.layout.grid']] as const).map(([key, icon, label]) => <button type="button" key={key} aria-pressed={value === key} className={value === key ? 'is-active' : ''} title={t(label)} aria-label={t(label)} onClick={() => onChange(key)}><Icon name={icon} size={18} /></button>)}</div>;
}

export function Breadcrumbs({ path, onOpen, onDropDocs, rootLabel }: { path: { id: string; name: string }[]; rootLabel?: string; onOpen: (id: string | null) => void; onDropDocs?: (folderId: string | null, docIds: string[]) => void }) {
  const t = useT();
  const drop = (id: string | null) => onDropDocs ? { onDragOver: (event: React.DragEvent) => event.preventDefault(), onDrop: (event: React.DragEvent) => { event.preventDefault(); const ids = event.dataTransfer.getData('text/x-aven-docs'); if (ids) onDropDocs(id, ids.split(',')); } } : {};
  return <nav className="dl-crumbs" aria-label={t('dl.breadcrumb')}><ol>
    <li><button type="button" onClick={() => onOpen(null)} aria-current={path.length === 0 ? 'page' : undefined} {...drop(null)}>{rootLabel ?? t('nav.documents')}</button></li>
    {path.map((folder, index) => <li key={folder.id}><span aria-hidden="true">/</span><button type="button" aria-current={index === path.length - 1 ? 'page' : undefined} onClick={() => onOpen(folder.id)} {...drop(folder.id)}>{folder.name}</button></li>)}
  </ol></nav>;
}

export type Entry = { kind: 'folder'; folder: FolderRecord } | { kind: 'doc'; doc: DocRecord };
type Handlers = {
  layout: 'LIST' | 'GRID'; entries: Entry[]; selected: Set<string>; locations: Map<string, string>; sort: SortKey; onSort: (column: 'NAME' | 'MODIFIED' | 'OWNER') => void;
  onToggle: (id: string, on: boolean) => void; onToggleAll: (on: boolean) => void; onOpenFolder: (id: string) => void;
  menuFor: (entry: Entry) => MenuAction[]; onDropDocs: (folderId: string, docIds: string[]) => void; dragIds: (id: string) => string[];
};

function KindTile({ icon, folder }: { icon: IconName; folder?: boolean }) { return <span className={`dl-tile${folder ? ' dl-tile--folder' : ''}`} aria-hidden="true"><Icon name={icon} size={20} /></span>; }

/** Documents and folders in one component. List and Grid differ only in layout, so rows and cards can never drift apart. */
export function EntryList(props: Handlers) {
  const t = useT();
  const { layout, entries, selected, locations } = props;
  const [over, setOver] = useState('');
  const docIds = entries.filter((entry): entry is Extract<Entry, { kind: 'doc' }> => entry.kind === 'doc').map((entry) => entry.doc.id);
  const all = docIds.length > 0 && docIds.every((id) => selected.has(id));
  const active = sortColumn(props.sort);
  const header = (column: 'NAME' | 'MODIFIED' | 'OWNER', label: string) => <button type="button" className={`dl-sortbtn${active.column === column ? ' is-active' : ''}`} aria-label={t('dl.sortBy', { column: label })} onClick={() => props.onSort(column)}>{label}{active.column === column && <Icon name="chevron" size={12} />}</button>;

  const render = (entry: Entry) => {
    const isFolder = entry.kind === 'folder';
    const id = isFolder ? entry.folder.id : entry.doc.id;
    const name = isFolder ? entry.folder.name : entry.doc.title;
    const owner = isFolder ? entry.folder.createdBy.displayName : entry.doc.createdBy?.displayName ?? null;
    const modified = isFolder ? entry.folder.updatedAt : entry.doc.updatedAt;
    const project = isFolder ? null : entry.doc.project?.name ?? null;
    const place = isFolder ? '' : locations.get(entry.doc.id) ?? '';
    const checked = selected.has(id);
    const title = isFolder
      ? <button type="button" className="dl-name" onClick={() => props.onOpenFolder(id)}>{name}</button>
      : <Link className="dl-name" href={`/workspace/documents/${id}`}>{name}</Link>;
    const dnd = isFolder
      ? { onDragOver: (event: React.DragEvent) => { if (event.dataTransfer.types.includes('text/x-aven-docs')) { event.preventDefault(); setOver(id); } }, onDragLeave: () => setOver((current) => (current === id ? '' : current)), onDrop: (event: React.DragEvent) => { event.preventDefault(); setOver(''); const ids = event.dataTransfer.getData('text/x-aven-docs'); if (ids) props.onDropDocs(id, ids.split(',')); } }
      : { draggable: true, onDragStart: (event: React.DragEvent) => { event.dataTransfer.setData('text/x-aven-docs', props.dragIds(id).join(',')); event.dataTransfer.effectAllowed = 'move'; } };
    const actions = <span className="dl-actions">{!isFolder && <FavouriteStar kind="DOCUMENT" entityId={id} />}<ItemMenu name={name} actions={props.menuFor(entry)} /></span>;
    const className = `dl-item dl-item--${layout.toLowerCase()}${checked ? ' is-selected' : ''}${over === id ? ' is-over' : ''}${isFolder ? ' is-folder' : ''}`;
    const check = !isFolder ? <label className="dl-check"><input type="checkbox" checked={checked} aria-label={t('dl.select', { name })} onChange={(event) => props.onToggle(id, event.target.checked)} /></label> : <span className="dl-check" />;
    if (layout === 'LIST') return <li key={id} className={className} {...dnd}>
      {check}
      <span className="dl-cell dl-cell--name"><KindTile icon={isFolder ? 'folder' : kindIcon(entry.kind === 'doc' ? entry.doc.docType : null)} folder={isFolder} /><span className="dl-namebox">{title}{place && <small>{place}</small>}{isFolder && <small>{countText(t, entry.folder.documentCount, entry.folder.folderCount)}</small>}</span></span>
      <span className="dl-cell dl-cell--project" data-label={t('doc.project')}>{project ? <span className="dl-pill">{project}</span> : <span className="dl-muted">—</span>}</span>
      <span className="dl-cell dl-cell--owner" data-label={t('dl.owner')}>{owner ? <span className="dl-owner"><Avatar name={owner} size={24} /><span>{owner}</span></span> : <span className="dl-muted">—</span>}</span>
      <span className="dl-cell dl-cell--date" data-label={t('dl.modified')}>{formatDay(modified)}</span>
      {actions}
    </li>;
    return <li key={id} className={className} {...dnd}>
      <div className="dl-card__preview" aria-hidden={isFolder ? undefined : true}>
        {isFolder ? <span className="dl-card__folder"><Icon name="folder" size={44} /></span> : (() => { const text = previewText(entry.kind === 'doc' ? entry.doc.content : '', 180); return text ? <p>{text}</p> : <span className="dl-card__blank"><Icon name={kindIcon(entry.kind === 'doc' ? entry.doc.docType : null)} size={34} /></span>; })()}
        {check}
      </div>
      <div className="dl-card__body">
        <span className="dl-card__title"><KindTile icon={isFolder ? 'folder' : kindIcon(entry.kind === 'doc' ? entry.doc.docType : null)} folder={isFolder} />{title}</span>
        <small className="dl-card__meta">{isFolder ? countText(t, entry.folder.documentCount, entry.folder.folderCount) : <>{project && <span className="dl-pill">{project}</span>}{t('doc.updated', { date: formatDay(modified) })}</>}</small>
        {place && <small className="dl-card__meta">{place}</small>}
      </div>
      {actions}
    </li>;
  };

  if (layout === 'GRID') return <ul className="dl-grid" aria-label={t('nav.documents')}>{entries.map(render)}</ul>;
  return <div className="dl-list" role="group" aria-label={t('nav.documents')}>
    <div className="dl-list__head">
      <label className="dl-check"><input type="checkbox" checked={all} disabled={docIds.length === 0} aria-label={t('dl.selectAll')} onChange={(event) => props.onToggleAll(event.target.checked)} /></label>
      <span className="dl-cell--name">{header('NAME', t('file.colName'))}</span><span className="dl-cell--project">{t('doc.project')}</span><span className="dl-cell--owner">{header('OWNER', t('dl.owner'))}</span><span className="dl-cell--date">{header('MODIFIED', t('dl.modified'))}</span><span className="dl-actions-head"><span className="visually-hidden">{t('file.colActions')}</span></span>
    </div>
    <ul>{entries.map(render)}</ul>
  </div>;
}

/** Appears only while documents are selected. */
export function BulkBar({ count, onMove, onDelete, onFavourite, onDownload, onClear, canDownload }: { count: number; onMove: () => void; onDelete: () => void; onFavourite: () => void; onDownload: () => void; onClear: () => void; canDownload: boolean }) {
  const t = useT();
  return <div className="dl-bulk" role="region" aria-label={t('dl.bulkBar')}>
    <strong>{t('pj.selectedN', { n: count })}</strong><span className="pw-spacer" />
    <button type="button" className="rd-btn rd-btn--soft rd-btn--small" onClick={onMove}><Icon name="folder" size={16} />{t('dl.move')}</button>
    <button type="button" className="rd-btn rd-btn--soft rd-btn--small" onClick={onFavourite}><Icon name="star" size={16} />{t('dl.addFavourites')}</button>
    <button type="button" className="rd-btn rd-btn--soft rd-btn--small" disabled={!canDownload} title={canDownload ? undefined : t('dl.downloadLimit')} onClick={onDownload}><Icon name="download" size={16} />{t('file.download')}</button>
    <button type="button" className="rd-btn rd-btn--soft rd-btn--small pw-btn--danger-soft" onClick={onDelete}><Icon name="trash" size={16} />{t('file.delete')}</button>
    <button type="button" className="rd-iconbtn" aria-label={t('pj.clearSelection')} onClick={onClear}><Icon name="close" size={16} /></button>
  </div>;
}
