'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useT } from '../../../i18n';
import { parseTaskCsv, type TaskImportRow } from '../task-csv';
import { Icon } from '../../home-icons';
import { Field, Modal, capitalise, priorityKey, taskStatusKey } from '../project-ui';
import { useProject } from '../project-context';
import { messageOf } from '../project-api';
import { defaultFilters, taskPriorities, taskStatuses, type SavedTaskView } from '../project-model';

const labelPattern = /^[\p{L}\p{N}_-]+$/u;

/** Saved views are shared by the whole workspace. Applying one narrows this project's tasks the same way. */
export function SavedViews() {
  const t = useT();
  const { project, views, legacyViews, filters, setFilters, setSelected, request, reloadViews, busy, setBusy, fail, say } = useProject();
  const [choice, setChoice] = useState('');
  const [name, setName] = useState('');
  const chosen = views.find((view) => view.id === choice);
  async function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!chosen && views.length >= 20) { fail(new Error('This workspace already has 20 saved task views.'), ''); return; }
    setBusy(true);
    try {
      const saved = await request<SavedTaskView>(chosen ? `/tasks/views/${chosen.id}` : '/tasks/views', { method: chosen ? 'PATCH' : 'POST', body: JSON.stringify({ name: trimmed, filters: { ...filters, projectId: project.id } }) });
      await reloadViews(); setChoice(saved.id); setName(saved.name); say(t(chosen ? 'pj.viewUpdated' : 'pj.viewSaved', { name: saved.name }));
    } catch (reason) { fail(reason, 'Could not save this task view.'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!chosen) return;
    setBusy(true);
    try { await request(`/tasks/views/${chosen.id}`, { method: 'DELETE' }); await reloadViews(); setChoice(''); setName(''); say(t('pj.viewDeleted')); }
    catch (reason) { fail(reason, 'Could not delete this task view.'); } finally { setBusy(false); }
  }
  return <details className="pw-menu"><summary className="rd-btn rd-btn--soft"><Icon name="layers" size={18} />{t('pw.views')}<Icon name="chevron" size={14} /></summary>
    <div className="pw-menu__panel pw-menu__panel--wide">
      <p className="pw-muted">{t('pj.sharedCount', { n: views.length })}</p>
      {views.length === 0 ? <p className="pw-muted">{t('pw.noViews')}</p> : <ul className="pw-menu__list">{views.map((view) => <li key={view.id}><button type="button" className={view.id === choice ? 'is-on' : ''} onClick={() => { setChoice(view.id); setName(view.name); setFilters({ ...defaultFilters(project.id), ...view.filters, projectId: project.id }); setSelected([]); say(t('pj.applied', { name: view.name })); }}>{view.name}{view.createdBy?.displayName ? <small> · {view.createdBy.displayName}</small> : null}</button></li>)}</ul>}
      <form onSubmit={(event) => void save(event)} className="pw-form">
        <Field label={chosen ? t('pj.updateSharedView') : t('pj.saveCurrentView')}><input required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('pj.viewNamePh')} /></Field>
        <div className="pw-actions"><button type="submit" className="rd-btn rd-btn--small" disabled={busy || (!chosen && views.length >= 20)}>{chosen ? t('pj.updateView') : t('pj.saveView')}</button>
          {chosen && <button type="button" className="rd-btn rd-btn--soft rd-btn--small" disabled={busy} onClick={() => void remove()}>{t('pj.deleteView')}</button>}
          {chosen && <button type="button" className="rd-btn rd-btn--soft rd-btn--small" onClick={() => { setChoice(''); setName(''); }}>{t('pj.newView')}</button>}</div>
      </form>
      {legacyViews > 0 && <p className="pw-muted" role="status">{t('pj.legacy', { n: legacyViews })}</p>}
    </div></details>;
}

/** Change several tasks at once. Only the fields you set are touched. */
export function BulkDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { members, selected, setSelected, request, reloadTasks, reloadMilestones, busy, setBusy, say } = useProject();
  const [problem, setProblem] = useState('');
  const [dueMode, setDueMode] = useState('KEEP'); const [startMode, setStartMode] = useState('KEEP'); const [labelMode, setLabelMode] = useState('KEEP');
  const formRef = useRef<HTMLFormElement>(null);
  async function apply(duplicate: boolean) {
    const form = new FormData(formRef.current ?? undefined);
    const value = (name: string) => String(form.get(name) ?? '');
    setBusy(true); setProblem('');
    try {
      if (duplicate) {
        if (selected.length > 100) throw new Error(t('pj.dupLimit'));
        const result = await request<{ duplicated: number; checklistItemsCopied: number }>('/tasks/bulk/duplicate', { method: 'POST', body: JSON.stringify({ taskIds: selected }) });
        say(t('pj.bulkDuplicated', { n: result.duplicated, items: result.checklistItemsCopied }));
      } else {
        const changes: Record<string, unknown> = {};
        if (value('priority')) changes.priority = value('priority');
        if (value('assigneeId')) changes.assigneeId = value('assigneeId') === '__clear__' ? null : value('assigneeId');
        if (value('status')) changes.status = value('status');
        if (dueMode === 'SET') { if (!value('dueAt')) throw new Error('Choose a date or select Clear due date.'); changes.dueAt = value('dueAt'); } else if (dueMode === 'CLEAR') changes.dueAt = null;
        if (startMode === 'SET') { if (!value('startAt')) throw new Error('Choose a start date or select Clear start date.'); changes.startAt = value('startAt'); } else if (startMode === 'CLEAR') changes.startAt = null;
        if (labelMode !== 'KEEP') {
          const labels = [...new Set(value('labels').split(',').map((label) => label.trim().toLocaleLowerCase()).filter(Boolean))];
          if (labelMode !== 'REPLACE' && labels.length === 0) throw new Error('Enter one or more labels to add or remove.');
          if (labels.some((label) => label.length > 32 || !labelPattern.test(label)) || labels.length > 10) throw new Error('Use up to 10 labels, each 1–32 letters, numbers, underscores, or hyphens.');
          if (labelMode === 'ADD') changes.addLabels = labels; else if (labelMode === 'REMOVE') changes.removeLabels = labels; else changes.labels = labels;
        }
        if (!Object.keys(changes).length) throw new Error('Choose at least one bulk change first.');
        const result = await request<{ updated: number }>('/tasks/bulk', { method: 'PATCH', body: JSON.stringify({ taskIds: selected, ...changes }) });
        say(t('pj.bulkUpdated', { n: result.updated }));
      }
      setSelected([]); await Promise.all([reloadTasks(), reloadMilestones()]); onClose();
    } catch (reason) { setProblem(messageOf(reason, 'Could not update the selected tasks.')); } finally { setBusy(false); }
  }
  return <Modal title={t('pw.bulkTitle')} description={t('pj.selectedN', { n: selected.length })} onClose={onClose}>
    <form ref={formRef} className="pw-form" onSubmit={(event) => { event.preventDefault(); void apply(false); }}>
      <div className="pw-form__row">
        <Field label={t('pj.status')}><select name="status" defaultValue=""><option value="">{t('pj.keepCurrent')}</option>{taskStatuses.map((status) => <option key={status} value={status}>{t(taskStatusKey[status])}</option>)}</select></Field>
        <Field label={t('pj.priority')}><select name="priority" defaultValue=""><option value="">{t('pj.keepCurrent')}</option>{taskPriorities.map((priority) => <option key={priority} value={priority}>{capitalise(t(priorityKey[priority]))}</option>)}</select></Field>
        <Field label={t('pj.assignTo')}><select name="assigneeId" defaultValue=""><option value="">{t('pj.keepCurrent')}</option><option value="__clear__">{t('pj.unassign')}</option>{members.filter((member) => member.role !== 'GUEST').map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></Field>
      </div>
      <div className="pw-form__row">
        <Field label={t('pj.startDate')}><select value={startMode} onChange={(event) => setStartMode(event.target.value)}><option value="KEEP">{t('pj.keepCurrent')}</option><option value="SET">{t('pj.setDate')}</option><option value="CLEAR">{t('pj.clearDate')}</option></select></Field>
        {startMode === 'SET' && <Field label={t('pj.newStartDate')}><input name="startAt" type="date" /></Field>}
        <Field label={t('pj.dueDate')}><select value={dueMode} onChange={(event) => setDueMode(event.target.value)}><option value="KEEP">{t('pj.keepCurrent')}</option><option value="SET">{t('pj.setDate')}</option><option value="CLEAR">{t('pj.clearDate')}</option></select></Field>
        {dueMode === 'SET' && <Field label={t('pj.newDueDate')}><input name="dueAt" type="date" /></Field>}
      </div>
      <div className="pw-form__row">
        <Field label={t('pj.labels')}><select value={labelMode} onChange={(event) => setLabelMode(event.target.value)}><option value="KEEP">{t('pj.keepCurrent')}</option><option value="ADD">{t('pj.b.add')}</option><option value="REMOVE">{t('pj.b.remove')}</option><option value="REPLACE">{t('pj.b.replace')}</option></select></Field>
        {labelMode !== 'KEEP' && <Field label={t('pj.labelNames')} hint={labelMode === 'REPLACE' ? t('pj.bulkHint') : undefined}><input name="labels" maxLength={330} placeholder={t('pj.labelNamesPh')} /></Field>}
      </div>
      {problem && <p className="pw-notice pw-notice--error" role="alert">{problem}</p>}
      <div className="pw-actions"><button type="button" className="rd-btn rd-btn--soft" onClick={onClose}>{t('msg.cancel')}</button>
        <button type="button" className="rd-btn rd-btn--soft" disabled={busy || selected.length > 100} onClick={() => void apply(true)}>{busy ? t('pj.working') : t('pj.dupChecklists')}</button>
        <button type="submit" className="rd-btn" disabled={busy}>{busy ? t('pj.updating') : t('pj.applyChanges')}</button></div>
    </form>
  </Modal>;
}

/** Reads a CSV, shows what it contains, and only imports once confirmed. */
export function ImportDialog({ file, onClose }: { file: File; onClose: () => void }) {
  const t = useT();
  const { project, tasks, request, reloadTasks, reloadMilestones, busy, setBusy, say } = useProject();
  const [rows, setRows] = useState<TaskImportRow[] | null>(null);
  const [mode, setMode] = useState<'CREATE' | 'UPSERT'>('CREATE');
  const [problem, setProblem] = useState('');
  const [parsed, setParsed] = useState(false);
  if (!parsed) {
    setParsed(true);
    void (async () => {
      try {
        if (file.size > 1_000_000) throw new Error('CSV files must be smaller than 1 MB.');
        const result = parseTaskCsv(await file.text());
        const known = new Set(tasks.map((task) => task.id));
        if (result.some((row) => row.id && !known.has(row.id))) throw new Error('This project import can only update task IDs already in this project. Remove those rows or choose a different CSV.');
        setRows(result);
      } catch (reason) { setProblem(messageOf(reason, 'Could not read this CSV file.')); }
    })();
  }
  async function run(event: FormEvent) {
    event.preventDefault();
    if (!rows?.length) return;
    setBusy(true); setProblem('');
    try {
      const scoped = rows.map((row) => ({ ...row, projectId: project.id, ...(mode === 'CREATE' ? { id: null } : {}) }));
      const result = await request<{ created: number; updated: number; unchanged: number }>('/tasks/import', { method: 'POST', body: JSON.stringify({ mode, projectId: project.id, tasks: scoped }) });
      await Promise.all([reloadTasks(), reloadMilestones()]);
      say(t('ph.csvComplete', { created: result.created, updated: result.updated, unchanged: result.unchanged })); onClose();
    } catch (reason) { setProblem(messageOf(reason, 'Could not import these tasks.')); } finally { setBusy(false); }
  }
  return <Modal title={t('pj.importCsv')} description={file.name} onClose={onClose}>
    <form className="pw-form" onSubmit={(event) => void run(event)}>
      {rows && <>
        <p>{t('ph.rowsMatch', { n: rows.length, m: rows.filter((row) => row.id).length })}</p>
        <p className="pw-muted">{rows.slice(0, 3).map((row) => row.title).join(' · ')}{rows.length > 3 ? ' …' : ''}</p>
        <Field label={t('pj.importBehavior')}><select value={mode} onChange={(event) => setMode(event.target.value as 'CREATE' | 'UPSERT')}><option value="CREATE">{t('pj.importCreate')}</option><option value="UPSERT" disabled={!rows.some((row) => row.id)}>{t('ph.importSync')}</option></select></Field>
        {mode === 'UPSERT' && <p className="pw-muted">{t('pj.importSyncHint')}</p>}
      </>}
      {!rows && !problem && <p className="pw-muted">{t('ph.loading')}</p>}
      <p className="pw-muted">{t('ph.importHint')}</p>
      {problem && <p className="pw-notice pw-notice--error" role="alert">{problem}</p>}
      <div className="pw-actions"><button type="button" className="rd-btn rd-btn--soft" onClick={onClose}>{t('msg.cancel')}</button><button type="submit" className="rd-btn" disabled={busy || !rows?.length}>{busy ? t('pj.importing') : mode === 'UPSERT' ? t('pj.syncCsv') : t('pj.importTasks')}</button></div>
    </form>
  </Modal>;
}

/** Labels belong to the whole workspace, so renaming or removing one changes every project. */
export function LabelsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { labels, filters, setFilters, request, reload, reloadViews, busy, setBusy, fail, say } = useProject();
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  async function rename(event: FormEvent) {
    event.preventDefault();
    if (!from || !to.trim()) return;
    setBusy(true);
    try {
      const result = await request<{ from: string; to: string; updated: number; merged: number }>('/tasks/labels', { method: 'PATCH', body: JSON.stringify({ from, to }) });
      if (filters.label === result.from) setFilters((current) => ({ ...current, label: result.to }));
      setFrom(''); setTo(''); await Promise.all([reload(), reloadViews()]);
      say(t('pj.labelRenamed', { from: result.from, to: result.to, n: result.updated, merged: result.merged ? t('pj.labelMerged', { n: result.merged }) : '' }));
    } catch (reason) { fail(reason, 'Could not rename this label.'); } finally { setBusy(false); }
  }
  async function remove(label: string) {
    if (!window.confirm(t('pj.removeLabelConfirm', { label }))) return;
    setBusy(true);
    try {
      const result = await request<{ label: string; updated: number }>(`/tasks/labels/${encodeURIComponent(label)}`, { method: 'DELETE' });
      if (filters.label === result.label) setFilters((current) => ({ ...current, label: '' }));
      await Promise.all([reload(), reloadViews()]); say(t('pj.labelRemoved', { label: result.label, n: result.updated }));
    } catch (reason) { fail(reason, 'Could not remove this label.'); } finally { setBusy(false); }
  }
  return <Modal title={t('pj.wsLabels')} description={t('pj.labelsHint')} onClose={onClose}>
    <form className="pw-form" onSubmit={(event) => void rename(event)}>
      <div className="pw-form__row">
        <Field label={t('pj.renameMerge')}><select required value={from} onChange={(event) => setFrom(event.target.value)}><option value="">{t('pj.chooseLabel')}</option>{labels.map((item) => <option key={item.label} value={item.label}>{t('pj.labelUsage', { label: item.label, n: item.taskCount })}</option>)}</select></Field>
        <Field label={t('pj.newLabelName')}><input required maxLength={32} pattern="[\p{L}\p{N}_-]+" value={to} onChange={(event) => setTo(event.target.value)} placeholder={t('pj.newLabelPh')} /></Field>
      </div>
      <div className="pw-actions"><button type="submit" className="rd-btn" disabled={busy || !from || !to.trim()}>{busy ? t('set.saving') : t('pj.renameMergeBtn')}</button></div>
    </form>
    {labels.length === 0 ? <p className="pw-muted">{t('pj.noLabels')}</p> : <ul className="pw-rows">{labels.map((item) => <li key={item.label}><span><strong>#{item.label}</strong><small>{t(item.taskCount === 1 ? 'pj.taskOne' : 'pj.taskMany', { n: item.taskCount })}</small></span><button type="button" className="rd-btn rd-btn--soft rd-btn--small" disabled={busy} onClick={() => { setFrom(item.label); setTo(''); }}>{t('pj.rename')}</button><button type="button" className="rd-btn rd-btn--soft rd-btn--small pw-btn--danger-soft" disabled={busy} onClick={() => void remove(item.label)}>{t('pj.removeEverywhere')}</button></li>)}</ul>}
  </Modal>;
}

