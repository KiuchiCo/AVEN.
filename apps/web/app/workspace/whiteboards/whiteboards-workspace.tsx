'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import { useWorkspaceSession } from '../workspace-shell';
import { Icon, type IconName } from '../home-icons';
import { EmptyState, PageHeader, Panel } from '../ui';
import { attachArrows } from './board-geometry';
import { buildTemplate, templateOptions, type TemplateKey } from './board-templates';
import type { BoardSummary } from './board-types';
import { connectionError } from '../connection-error';

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
  const [layout, setLayout] = useState<'GRID' | 'LIST'>('GRID');
  const [sort, setSort] = useState<'UPDATED' | 'NAME'>('UPDATED');
  const [moreTemplates, setMoreTemplates] = useState(false);
  const readOnly = workspace.role === 'GUEST';

  const call = useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const token = await getToken();
    if (!token || !apiBase) throw connectionError(token);
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

  const chips: { key: TemplateKey; icon: IconName }[] = [{ key: 'blank', icon: 'doc' }, { key: 'mindmap', icon: 'users' }, { key: 'flowchart', icon: 'columns' }, { key: 'brainstorm', icon: 'sparkle' }, { key: 'journey', icon: 'trend' }];
  const extra = templateOptions.filter((option) => !chips.some((chip) => chip.key === option.key));
  const sorted = [...(boards ?? [])].sort((a, b) => sort === 'NAME' ? a.name.localeCompare(b.name) : Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const label = (key: TemplateKey) => templateOptions.find((option) => option.key === key)?.label ?? key;

  return <section className="workspace-settings-page wb-page">
    <PageHeader title={t('nav.whiteboards')} description={t('wb.desc')} />
    {!readOnly && <Panel icon="chart" title={t('wb.createTitle')} id="wb-new">
      <form className="whiteboard-new" onSubmit={create}><label htmlFor="board-name" className="visually-hidden">{t('wb.nameLabel')}</label><input id="board-name" className="rd-input" value={name} maxLength={120} placeholder={t('wb.namePlaceholder')} onChange={(event) => setName(event.target.value)} required /><label className="visually-hidden" htmlFor="board-template">{t('wb.template')}</label><select id="board-template" className="rd-select" value={template} onChange={(event) => setTemplate(event.target.value as TemplateKey)}>{templateOptions.map((option) => <option key={option.key} value={option.key}>{option.label}—{option.hint}</option>)}</select><button className="rd-btn" disabled={!name.trim()}>{t('wb.create')}</button></form>
      <div className="wb-chips" role="group" aria-label={t('wb.startFrom')}><span>{t('wb.startFrom')}</span>{chips.map((chip) => <button type="button" key={chip.key} aria-pressed={template === chip.key} className={template === chip.key ? 'is-active' : ''} onClick={() => setTemplate(chip.key)}><Icon name={chip.icon} size={18} />{label(chip.key)}</button>)}{moreTemplates ? extra.map((option) => <button type="button" key={option.key} aria-pressed={template === option.key} className={template === option.key ? 'is-active' : ''} onClick={() => setTemplate(option.key)}><Icon name="list" size={18} />{option.label}</button>) : extra.length > 0 && <button type="button" onClick={() => setMoreTemplates(true)}><Icon name="more" size={18} />{t('wb.moreTemplates')}</button>}</div>
    </Panel>}
    {error && <p className="workspace-settings-status" role="alert">{error}</p>}
    <div className="rd-listbar wb-listbar"><h2 className="wb-count">{t('wb.yours')} <span>{boards?.length ?? 0}</span></h2><div className="rd-listbar__tools"><div className="rd-viewswitch" role="group" aria-label={t('tasks.views')}><button type="button" className={layout === 'GRID' ? 'is-active' : ''} aria-pressed={layout === 'GRID'} aria-label={t('wb.grid')} onClick={() => setLayout('GRID')}><Icon name="grid" size={18} /></button><button type="button" className={layout === 'LIST' ? 'is-active' : ''} aria-pressed={layout === 'LIST'} aria-label={t('tasks.v.list')} onClick={() => setLayout('LIST')}><Icon name="list" size={18} /></button></div><select className="rd-select" value={sort} aria-label={t('doc.sortAria')} onChange={(event) => setSort(event.target.value as 'UPDATED' | 'NAME')}><option value="UPDATED">{t('wb.sort.updated')}</option><option value="NAME">{t('wb.sort.name')}</option></select></div></div>
    {boards === null ? <p>{t('wb.loading')}</p> : boards.length === 0 ? <EmptyState art="stack" title={t('wb.none')} /> : <ul className={`whiteboard-list wb-cards${layout === 'LIST' ? ' wb-cards--list' : ''}`}>{sorted.map((board) => <li key={board.id}>
      <Link href={`/workspace/whiteboards/${board.id}`} className="wb-card__link"><span className="wb-card__art" aria-hidden="true" /><span className="wb-card__meta"><strong><Icon name="chart" size={18} />{board.name}</strong><small>{t('wb.updated', { date: new Date(board.updatedAt).toLocaleDateString(), name: board.createdBy.displayName })}</small></span></Link>
      {!readOnly && <div className="wb-card__actions"><button type="button" className="rd-btn rd-btn--soft rd-btn--small" onClick={() => void remove(board)} aria-label={t('wb.deleteAria', { name: board.name })}>{t('wb.delete')}</button></div>}
    </li>)}</ul>}
  </section>;
}
