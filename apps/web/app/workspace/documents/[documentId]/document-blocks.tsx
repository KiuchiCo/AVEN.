'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../../../i18n';
import { useWorkspaceSession } from '../../workspace-shell';
import { useFilesApi } from '../../files/use-files-api';
import type { FileRecord } from '../../files/types';
import { addColumn, addRow, applyCellOp, cleanRows, removeColumn, removeRow, setCell, tableLimits, type CellOp, type Rows } from './table-rules';
import { EditorIcon } from './editor-icons';
import type { Key } from '../../../i18n/en';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const imageTypes = /^image\/(png|jpeg|gif|webp)$/;

export function TableBlock({ rows, readOnly, onChange, blockId, onCell }: { rows: unknown; readOnly: boolean; onChange: (rows: Rows) => void; blockId?: string; onCell?: (blockId: string, row: number, col: number) => void }) {
  const t = useT();
  const grid = cleanRows(rows);
  const root = useRef<HTMLDivElement>(null);
  const [cell, setCellAt] = useState<{ r: number; c: number } | null>(null);
  const at = (r: number, c: number) => { setCellAt({ r, c }); if (blockId) onCell?.(blockId, r, c); };
  /** Row and column actions apply to the cell the caret is in: above or below its row, before or after its column, or that row or column itself. */
  function run(op: CellOp) {
    if (!cell) return;
    const done = applyCellOp(grid, op, cell.r, cell.c);
    if (done.rows === grid) return;
    onChange(done.rows); at(done.row, done.col);
    window.requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>(`input[data-cell="${done.row}-${done.col}"]`)?.focus());
  }
  const actions: { op: CellOp; key: Key; icon: 'rowAdd' | 'rowRemove' | 'colAdd' | 'colRemove'; disabled?: boolean }[] = [
    { op: 'rowAbove', key: 'tbl.rowAbove', icon: 'rowAdd', disabled: grid.length >= tableLimits.rows }, { op: 'rowBelow', key: 'tbl.rowBelow', icon: 'rowAdd', disabled: grid.length >= tableLimits.rows }, { op: 'deleteRow', key: 'tbl.rowDelete', icon: 'rowRemove', disabled: grid.length <= 1 },
    { op: 'colBefore', key: 'tbl.colBefore', icon: 'colAdd', disabled: grid[0].length >= tableLimits.columns }, { op: 'colAfter', key: 'tbl.colAfter', icon: 'colAdd', disabled: grid[0].length >= tableLimits.columns }, { op: 'deleteColumn', key: 'tbl.colDelete', icon: 'colRemove', disabled: grid[0].length <= 1 },
  ];
  return <div className="document-table" ref={root} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setCellAt(null); }}>
    {!readOnly && cell && <div className="document-table__bar" role="toolbar" aria-label={t('tbl.bar')} onMouseDown={(event) => { if ((event.target as HTMLElement).tagName !== 'INPUT') event.preventDefault(); }}>
      <span className="document-table__where">{t('tbl.cellAt', { r: cell.r + 1, c: cell.c + 1 })}</span>
      {actions.map((action) => <button type="button" key={action.op} disabled={action.disabled} title={t(action.key)} aria-label={t(action.key)} onClick={() => run(action.op)}><EditorIcon name={action.icon} size={16} /><span>{t(action.key)}</span></button>)}
    </div>}
    <div className="document-table__scroll"><table><tbody>{grid.map((row, r) => <tr key={r}>{row.map((value, c) => <td key={c} className={cell && (cell.r === r || cell.c === c) ? (cell.r === r && cell.c === c ? 'is-cell' : 'is-line') : undefined}><span className="document-table__print" aria-hidden="true">{value}</span><input data-cell={`${r}-${c}`} value={value} readOnly={readOnly} aria-label={t('bl.row', { r: r + 1, c: c + 1 })} onFocus={() => at(r, c)} onChange={(event) => onChange(setCell(grid, r, c, event.target.value))} /></td>)}
      {!readOnly && <td className="document-table__edge"><button type="button" onClick={() => onChange(removeRow(grid, r))} disabled={grid.length <= 1} aria-label={t('bl.removeRow', { n: r + 1 })}>×</button></td>}</tr>)}
      {!readOnly && <tr className="document-table__edge">{grid[0].map((_, c) => <td key={c}><button type="button" onClick={() => onChange(removeColumn(grid, c))} disabled={grid[0].length <= 1} aria-label={t('bl.removeCol', { n: c + 1 })}>×</button></td>)}<td /></tr>}
    </tbody></table></div>
    {!readOnly && <div className="document-table__actions"><button type="button" onClick={() => onChange(addRow(grid))}>{t('bl.addRow')}</button><button type="button" onClick={() => onChange(addColumn(grid))}>{t('bl.addCol')}</button></div>}
  </div>;
}

/** Fetches a stored image with the person's sign-in and shows it. Images are never reachable without that. */
function StoredImage({ fileId, alt }: { fileId: string; alt: string }) {
  const t = useT();
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true; let created: string | null = null;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch(`${apiBase}/workspaces/${workspace.id}/files/${fileId}/download?inline=1`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('missing');
        created = URL.createObjectURL(await response.blob());
        if (live) setUrl(created);
      } catch { if (live) setFailed(true); }
    })();
    return () => { live = false; if (created) URL.revokeObjectURL(created); };
  }, [fileId, getToken, workspace.id]);
  if (failed) return <p className="document-image__missing">{t('bl.imageGone')}</p>;
  // eslint-disable-next-line @next/next/no-img-element -- a blob URL from an authenticated download, which next/image can't load
  return url ? <img src={url} alt={alt} className="document-image__img" /> : <p className="document-image__missing">{t('bl.imageLoading')}</p>;
}

export function ImageBlock({ fileId, caption, readOnly, onPick, onCaption }: { fileId: string | undefined; caption: string; readOnly: boolean; onPick: (fileId: string) => void; onCaption: (text: string) => void }) {
  const t = useT();
  const files = useFilesApi();
  const [choices, setChoices] = useState<FileRecord[] | null>(null);
  const [error, setError] = useState('');

  async function browse() {
    setError('');
    try { const listing = await files.call<{ files: FileRecord[] }>(''); setChoices(listing.files.filter((file) => imageTypes.test(file.mimeType))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load your files.'); }
  }
  async function upload(file: File) {
    setError('');
    if (!imageTypes.test(file.type)) { setError(t('bl.badType')); return; }
    try { onPick((await files.upload(file)).id); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not upload that image.'); }
  }

  return <div className="document-image">
    {fileId ? <StoredImage fileId={fileId} alt={caption} /> : <p className="document-image__missing">{t('bl.noImage')}</p>}
    {!readOnly && <div className="document-image__actions">
      <label className="files-replace">{t('bl.upload')}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => { const next = event.target.files?.[0]; event.target.value = ''; if (next) void upload(next); }} /></label>
      <button type="button" onClick={() => void browse()}>{t('bl.choose')}</button>
    </div>}
    {choices && <ul className="document-image__choices">{choices.length ? choices.map((file) => <li key={file.id}><button type="button" onClick={() => { onPick(file.id); setChoices(null); }}>{file.name}</button></li>) : <li>{t('bl.noImages')}</li>}</ul>}
    {error && <p className="workspace-settings-status" role="alert">{error}</p>}
    <input className="document-image__caption" value={caption} readOnly={readOnly} placeholder={t('bl.caption')} maxLength={300} aria-label={t('bl.captionLabel')} onChange={(event) => onCaption(event.target.value)} />
  </div>;
}
