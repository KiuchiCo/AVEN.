'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/en';
import { Icon } from '../home-icons';
import { useWorkspaceSession } from '../workspace-shell';
import { messageOf, useProjectApi } from '../projects/project-api';
import { Field, Modal } from '../projects/project-ui';
import { createLocalDocument } from './[documentId]/local-documents';
import { documentKinds, folderTree, noAdvanced, pathLabel, type Advanced, type DocRecord, type FolderRecord, type Modified, type SortKey } from './library-model';
import { Popover, kindName } from './library-ui';
import { documentTemplates, encodeTemplate } from './templates';

/** Pick what to create (as cards, not a dropdown), give it a title and optionally a project. Closes and opens the editor on success. */
export function CreateDocumentModal({ projects, folders, folderId, onClose }: { projects: { id: string; name: string }[]; folders: FolderRecord[]; folderId: string | null; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const { request } = useProjectApi();
  const { workspace, user } = useWorkspaceSession();
  const [type, setType] = useState('BLANK');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const kind = documentKinds.find((item) => item.type === type) ?? documentKinds[0];
  const template = documentTemplates.find((item) => item.id === kind.template);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const title = text('title') || template?.title || '';
    if (!title) { setProblem(t('dl.titleRequired')); return; }
    const content = template ? encodeTemplate(template, text('content')) : String(form.get('content') ?? '');
    const projectId = text('projectId') || null;
    setBusy(true); setProblem('');
    try {
      const created = await request<DocRecord>('/documents', { method: 'POST', body: JSON.stringify({ title, content, projectId: projectId ?? undefined, docType: type, folderId: folderId ?? undefined }) });
      router.push(`/workspace/documents/${created.id}`);
    } catch (reason) {
      // No connection: the document is made on this device and created for real as soon as the connection returns.
      if (reason instanceof TypeError) {
        const id = createLocalDocument(window.localStorage, { userId: user.id, workspaceId: workspace.id }, { title, content, projectId }, () => crypto.randomUUID());
        if (id) { router.push(`/workspace/documents/${id}`); return; }
      }
      setProblem(messageOf(reason, t('dl.createFailed'))); setBusy(false);
    }
  }

  return <Modal title={t('dl.createTitle')} description={t('dl.createHint')} size="md" onClose={onClose}>
    <form className="pw-form" onSubmit={(event) => void submit(event)}>
      <div className="dl-types" role="radiogroup" aria-label={t('dl.chooseType')}>
        {documentKinds.map((item) => <label key={item.type} className={type === item.type ? 'is-on' : ''}>
          <input type="radio" name="docType" value={item.type} checked={type === item.type} onChange={() => setType(item.type)} />
          <Icon name={item.icon} size={24} /><strong>{t(kindName(item.type))}</strong><small>{t(`${kindName(item.type)}.d` as Key)}</small>
          {type === item.type && <span className="dl-types__tick" aria-hidden="true"><Icon name="checkCircle" size={18} /></span>}
        </label>)}
      </div>
      <h3 className="dl-subhead">{t('dl.details')}</h3>
      <Field label={t('doc.title')}><input name="title" maxLength={200} placeholder={template?.title ?? t('doc.titlePh')} required={!template} data-autofocus /></Field>
      <Field label={<>{t('doc.project')} <small>{t('doc.optional')}</small></>}><select name="projectId" defaultValue=""><option value="">{t('doc.noProject')}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
      <Field label={<>{t('doc.content')} <small>{t('doc.optional')}</small></>}><textarea name="content" maxLength={20000} rows={4} placeholder={t('doc.contentPh')} /></Field>
      {folderId && <p className="pw-muted"><Icon name="folder" size={14} /> {t('dl.creatingIn', { path: pathLabel(folders, folderId) })}</p>}
      {problem && <p className="pw-notice pw-notice--error" role="alert">{problem}</p>}
      <div className="pw-actions"><button type="button" className="rd-btn rd-btn--soft" onClick={onClose}>{t('msg.cancel')}</button><button type="submit" className="rd-btn" disabled={busy}>{busy ? t('set.saving') : t('dl.createDocument')}</button></div>
    </form>
  </Modal>;
}

/** One text field: used to name a new folder and to rename folders and documents. */
export function NameDialog({ title, label, initial = '', confirm, onSubmit, onClose }: { title: string; label: string; initial?: string; confirm: string; onSubmit: (name: string) => Promise<void>; onClose: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    if (!name) { setProblem(t('dl.nameRequired')); return; }
    setBusy(true); setProblem('');
    try { await onSubmit(name); onClose(); } catch (reason) { setProblem(messageOf(reason, t('dl.actionFailed'))); setBusy(false); }
  }
  return <Modal title={title} size="sm" onClose={onClose}>
    <form className="pw-form" onSubmit={(event) => void submit(event)}>
      <Field label={label}><input name="name" maxLength={200} defaultValue={initial} data-autofocus onFocus={(event) => event.currentTarget.select()} /></Field>
      {problem && <p className="pw-notice pw-notice--error" role="alert">{problem}</p>}
      <div className="pw-actions"><button type="button" className="rd-btn rd-btn--soft" onClick={onClose}>{t('msg.cancel')}</button><button type="submit" className="rd-btn" disabled={busy}>{busy ? t('set.saving') : confirm}</button></div>
    </form>
  </Modal>;
}

/** Choose a destination: the top level or any folder. Folders being moved (and what is inside them) are not offered. */
export function MoveDialog({ title, folders, exclude = [], current, onMove, onClose }: { title: string; folders: FolderRecord[]; exclude?: string[]; current: string | null | undefined; onMove: (folderId: string | null) => Promise<void>; onClose: () => void }) {
  const t = useT();
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const tree = folderTree(folders, exclude);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (target === undefined) return;
    setBusy(true); setProblem('');
    try { await onMove(target); onClose(); } catch (reason) { setProblem(messageOf(reason, t('dl.actionFailed'))); setBusy(false); }
  }
  const option = (id: string | null, label: string, depth: number) => <li key={id ?? 'root'}><label className={target === id ? 'is-on' : ''} style={{ paddingInlineStart: 12 + depth * 18 }}><input type="radio" name="dest" checked={target === id} disabled={current === id} onChange={() => setTarget(id)} /><Icon name="folder" size={16} /><span>{label}</span>{current === id && <small>{t('dl.currentPlace')}</small>}</label></li>;
  return <Modal title={title} size="sm" onClose={onClose}>
    <form className="pw-form" onSubmit={(event) => void submit(event)}>
      <ul className="dl-picker" role="radiogroup" aria-label={t('dl.chooseFolder')}>{option(null, t('nav.documents'), 0)}{tree.map(({ folder, depth }) => option(folder.id, folder.name, depth + 1))}</ul>
      {problem && <p className="pw-notice pw-notice--error" role="alert">{problem}</p>}
      <div className="pw-actions"><button type="button" className="rd-btn rd-btn--soft" onClick={onClose}>{t('msg.cancel')}</button><button type="submit" className="rd-btn" disabled={busy || target === undefined}>{busy ? t('set.saving') : t('dl.move')}</button></div>
    </form>
  </Modal>;
}

const sortKeys: SortKey[] = ['UPDATED', 'CREATED', 'NAME_ASC', 'NAME_DESC', 'OLDEST'];
export const sortLabel = (sort: SortKey): Key => (sort === 'OWNER_ASC' || sort === 'OWNER_DESC' ? 'dl.sort.owner' : `dl.sort.${sort}`) as Key;

/** Advanced filters and sorting in one popover. Nothing changes the list until "Apply filters". */
export function FiltersPanel({ count, advanced, sort, projects, owners, onApply }: { count: number; advanced: Advanced; sort: SortKey; projects: { id: string; name: string }[]; owners: { id: string; name: string }[]; onApply: (advanced: Advanced, sort: SortKey) => void }) {
  const t = useT();
  const [draft, setDraft] = useState(advanced); const [draftSort, setDraftSort] = useState(sort);
  const set = (patch: Partial<Advanced>) => setDraft((current) => ({ ...current, ...patch }));
  const modified: [Modified, Key][] = [['ANY', 'dl.mod.any'], ['DAY', 'dl.mod.day'], ['WEEK', 'dl.mod.week'], ['MONTH', 'dl.mod.month'], ['YEAR', 'dl.mod.year']];
  return <Popover label={t('dl.filterTitle')} className="dl-filters" buttonClass={`rd-btn rd-btn--soft${count ? ' is-active' : ''}`} onOpen={() => { setDraft(advanced); setDraftSort(sort); }} buttonContent={<><Icon name="filter" size={18} />{t('pw.filters')}{count > 0 && <b className="pw-badge">{count}</b>}</>}>
    {(close) => <form onSubmit={(event) => { event.preventDefault(); onApply(draft, draftSort); close(); }}>
      <header><h2>{t('dl.filterTitle')}</h2><button type="button" className="rd-iconbtn" aria-label={t('blk.close')} onClick={close}><Icon name="close" size={16} /></button></header>
      <div className="dl-filters__body">
        <Field label={t('doc.project')}><select value={draft.projectId} onChange={(event) => set({ projectId: event.target.value })}><option value="">{t('dl.allProjects')}</option><option value="NONE">{t('doc.noProject')}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
        <Field label={t('dl.owner')}><select value={draft.ownerId} onChange={(event) => set({ ownerId: event.target.value })}><option value="">{t('pj.anyone')}</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></Field>
        <Field label={t('dl.modified')}><select value={draft.modified} onChange={(event) => set({ modified: event.target.value as Modified })}>{modified.map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></Field>
        <Field label={t('dl.docType')}><select value={draft.docType} onChange={(event) => set({ docType: event.target.value })}><option value="">{t('dl.anyType')}</option>{documentKinds.map((kind) => <option key={kind.type} value={kind.type}>{t(kindName(kind.type))}</option>)}<option value="OTHER">{t('dl.type.OTHER')}</option></select></Field>
        <label className="dl-filters__check"><input type="checkbox" checked={draft.favourite} onChange={(event) => set({ favourite: event.target.checked })} />{t('dl.onlyFavourites')}</label>
        <Field label={t('pj.sort')}><select value={draftSort} onChange={(event) => setDraftSort(event.target.value as SortKey)}>{(sortKeys.includes(draftSort) ? sortKeys : [...sortKeys, draftSort]).map((key) => <option key={key} value={key}>{t(sortLabel(key))}</option>)}</select></Field>
      </div>
      <footer><button type="button" className="pw-link" onClick={() => { setDraft(noAdvanced); setDraftSort('UPDATED'); onApply(noAdvanced, 'UPDATED'); close(); }}>{t('dl.clearAll')}</button><button type="submit" className="rd-btn">{t('dl.apply')}</button></footer>
    </form>}
  </Popover>;
}
