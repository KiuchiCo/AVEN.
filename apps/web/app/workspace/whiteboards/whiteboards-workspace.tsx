'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import { useWorkspaceSession } from '../workspace-shell';
import { attachArrows } from './board-geometry';
import { buildTemplate, templateOptions, type TemplateKey } from './board-templates';
import type { BoardSummary } from './board-types';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

export function WhiteboardsWorkspace() {
  const t = useT();
  const { workspace } = useWorkspaceSession();
  const { getToken } = useAuth();
  const router = useRouter();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<TemplateKey>('blank');
  const [error, setError] = useState('');
  const readOnly = workspace.role === 'GUEST';

  const call = useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API.');
    const response = await fetch(`${apiBase}/workspaces/${workspace.id}/whiteboards${path}`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(json?.message ?? 'AVEN could not complete that request.');
    return json as T;
  }, [getToken, workspace.id]);

  useEffect(() => { void call<BoardSummary[]>('').then(setBoards).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load whiteboards.')); }, [call]);

  async function create(event: FormEvent) {
    event.preventDefault(); setError('');
    try { const board = await call<BoardSummary>('', 'POST', { name, elements: buildTemplate(template, attachArrows) }); router.push(`/workspace/whiteboards/${board.id}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the whiteboard.'); }
  }
  async function remove(board: BoardSummary) {
    if (!window.confirm(t('wb.confirm', { name: board.name }))) return;
    try { await call(`/${board.id}`, 'DELETE'); setBoards((current) => current?.filter((item) => item.id !== board.id) ?? null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete the whiteboard.'); }
  }

  return <section className="workspace-settings-page">
    <header><p className="workspace-page-eyebrow">{t('nav.whiteboards').toUpperCase()}</p><h1>{t('nav.whiteboards')}</h1><p>{t('wb.desc')}</p></header>
    {!readOnly && <form className="whiteboard-new" onSubmit={create}><label htmlFor="board-name" className="visually-hidden">{t('wb.nameLabel')}</label><input id="board-name" value={name} maxLength={120} placeholder={t('wb.namePlaceholder')} onChange={(event) => setName(event.target.value)} required /><label className="visually-hidden" htmlFor="board-template">{t('wb.template')}</label><select id="board-template" value={template} onChange={(event) => setTemplate(event.target.value as TemplateKey)}>{templateOptions.map((option) => <option key={option.key} value={option.key}>{option.label} — {option.hint}</option>)}</select><button className="workspace-settings-save" disabled={!name.trim()}>{t('wb.create')}</button></form>}
    {error && <p className="workspace-settings-status" role="alert">{error}</p>}
    {boards === null ? <p>{t('wb.loading')}</p> : boards.length === 0 ? <p className="workspace-settings-note">{t('wb.none')}</p> : <ul className="whiteboard-list">{boards.map((board) => <li key={board.id}><Link href={`/workspace/whiteboards/${board.id}`}><strong>{board.name}</strong><small>{t('wb.updated', { date: new Date(board.updatedAt).toLocaleDateString(), name: board.createdBy.displayName })}</small></Link>{!readOnly && <button onClick={() => void remove(board)} aria-label={t('wb.deleteAria', { name: board.name })}>{t('wb.delete')}</button>}</li>)}</ul>}
  </section>;
}
