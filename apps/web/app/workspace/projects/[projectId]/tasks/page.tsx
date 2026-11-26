'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import { useT } from '../../../../i18n';
import { Icon } from '../../../home-icons';
import { EmptyState, PillTabs } from '../../../ui';
import { useProject, type TaskLayout } from '../../project-context';
import { activeFilterCount, defaultFilters, filterTasks, slug } from '../../project-model';
import { csvCell } from '../../task-csv';
import { Field } from '../../project-ui';
import { Board } from '../../tasks/board';
import { TaskList } from '../../tasks/list';
import { TaskCalendar } from '../../tasks/calendar';
import { BulkDialog, ImportDialog, LabelsDialog, SavedViews } from '../../tasks/task-tools';
import { taskPriorities, taskStatuses } from '../../project-model';
import { capitalise, priorityKey, taskStatusKey } from '../../project-ui';

/** The daily workspace: every task in this project, as a board, a list or a calendar, with all the filters and bulk tools. */
export default function TasksTab() {
  const t = useT();
  const { project, tasks, members, labels, filters, setFilters, layout, setLayout, selected, setSelected, openTask } = useProject();
  const [advanced, setAdvanced] = useState(false);
  const [dialog, setDialog] = useState<'bulk' | 'labels' | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const rows = useMemo(() => filterTasks(tasks, filters), [tasks, filters]);
  const narrowing = activeFilterCount(filters);
  const usedLabels = useMemo(() => [...new Set(tasks.flatMap((task) => task.labels))].sort(), [tasks]);
  const archived = project.status === 'ARCHIVED';
  const set = (patch: Partial<typeof filters>) => { setFilters((current) => ({ ...current, ...patch })); setSelected([]); };
  const layouts: { key: TaskLayout; label: string; icon: 'columns' | 'list' | 'calendar' }[] = [{ key: 'BOARD', label: t('pw.view.board'), icon: 'columns' }, { key: 'LIST', label: t('pw.view.list'), icon: 'list' }, { key: 'CALENDAR', label: t('pw.view.calendar'), icon: 'calendar' }];

  function exportCsv() {
    const header = ['id', 'title', 'description', 'status', 'priority', 'startAt', 'dueAt', 'projectId', 'assigneeId', 'labels'];
    const body = rows.map((task) => [task.id, task.title, task.description ?? '', task.status, task.priority, task.startAt ?? '', task.dueAt ?? '', project.id, task.assignee?.id ?? '', task.labels.join(';')]);
    const csv = [header, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${slug(project.name)}-tasks.csv`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function pick(event: ChangeEvent<HTMLInputElement>) { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) setImportFile(file); }

  return <div className="pw-stack">
    <div className="pw-toolbar">
      <PillTabs size="small" label={t('pw.viewSwitcher')} value={layout} onChange={setLayout} items={layouts.map((item) => ({ key: item.key, label: item.label, icon: item.icon }))} />
      <label className="pw-search"><Icon name="search" size={16} /><span className="visually-hidden">{t('pj.search')}</span><input type="search" value={filters.search} onChange={(event) => set({ search: event.target.value })} placeholder={t('pj.searchTasksPh')} /></label>
      <button type="button" className={`rd-btn rd-btn--soft${narrowing ? ' is-active' : ''}`} aria-expanded={advanced} aria-controls="pw-filters" onClick={() => setAdvanced((open) => !open)}><Icon name="filter" size={18} />{t('pw.filters')}{narrowing > 0 && <b className="pw-badge">{narrowing}</b>}</button>
      <SavedViews />
      <details className="pw-menu"><summary className="rd-btn rd-btn--soft" aria-label={t('pw.moreActions')}><Icon name="more" size={18} /><span className="pw-hide-sm">{t('pw.more')}</span></summary>
        <div className="pw-menu__panel"><ul className="pw-menu__list">
          <li><label className="pw-menu__item"><Icon name="download" size={16} />{t('pj.importBtn')}<input type="file" hidden accept=".csv,text/csv" disabled={archived} onChange={pick} /></label></li>
          <li><button type="button" onClick={exportCsv} disabled={!rows.length}><Icon name="upload" size={16} />{t('pj.exportCsv')}</button></li>
          <li><button type="button" onClick={() => setSelected(rows.slice(0, 500).map((task) => task.id))} disabled={!rows.length}><Icon name="checkCircle" size={16} />{t('pj.selectVisible')}</button></li>
          <li><button type="button" onClick={() => setDialog('labels')}><Icon name="tag" size={16} />{t('pj.wsLabels')}</button></li>
        </ul></div></details>
    </div>

    {advanced && <section id="pw-filters" className="pw-filters" aria-label={t('pj.filtersAria')}>
      <Field label={t('pj.status')}><select value={filters.status} onChange={(event) => set({ status: event.target.value })}><option value="ALL">{t('pj.allStatuses')}</option>{taskStatuses.map((status) => <option key={status} value={status}>{t(taskStatusKey[status])}</option>)}</select></Field>
      <Field label={t('pj.priority')}><select value={filters.priority} onChange={(event) => set({ priority: event.target.value })}><option value="ALL">{t('pj.allPriorities')}</option>{taskPriorities.map((priority) => <option key={priority} value={priority}>{capitalise(t(priorityKey[priority]))}</option>)}</select></Field>
      <Field label={t('pj.assignee')}><select value={filters.assigneeId} onChange={(event) => set({ assigneeId: event.target.value })}><option value="ALL">{t('pj.anyone')}</option><option value="UNASSIGNED">{t('pj.unassigned')}</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></Field>
      <Field label={t('lf.label')}><select value={filters.label} onChange={(event) => set({ label: event.target.value })}><option value="">{t('lf.all')}</option>{usedLabels.map((label) => <option key={label} value={label}>#{label}</option>)}</select></Field>
      <Field label={t('pj.dueDate')}><select value={filters.due} onChange={(event) => set({ due: event.target.value })}><option value="ALL">{t('pj.anyDate')}</option><option value="OVERDUE">{t('pj.overdue')}</option><option value="TODAY">{t('pj.dueToday')}</option><option value="NEXT_7_DAYS">{t('pj.next7')}</option><option value="NO_DATE">{t('pj.noDueDate')}</option></select></Field>
      <Field label={t('pj.dependency')}><select value={filters.dependency} onChange={(event) => set({ dependency: event.target.value })}><option value="ALL">{t('pj.d.any')}</option><option value="BLOCKED">{t('pj.d.blocked')}</option><option value="BLOCKING">{t('pj.d.blocking')}</option><option value="HAS_DEPENDENCIES">{t('pj.d.has')}</option><option value="NONE">{t('pj.d.none')}</option></select></Field>
      <Field label={t('pj.sort')}><select value={filters.sort} onChange={(event) => set({ sort: event.target.value })}><option value="DUE_ASC">{t('pj.so.dueAsc')}</option><option value="DUE_DESC">{t('pj.so.dueDesc')}</option><option value="PRIORITY">{t('pj.so.priority')}</option><option value="TITLE">{t('pj.so.title')}</option></select></Field>
      <div className="pw-filters__clear"><button type="button" className="rd-btn rd-btn--soft" onClick={() => { setFilters(defaultFilters(project.id)); setSelected([]); }} disabled={narrowing === 0 && filters.sort === 'DUE_ASC'}>{t('pj.clearFilters')}</button></div>
    </section>}

    <p className="pw-count" aria-live="polite">{t('pj.inView', { n: rows.length })}{labels.length === 0 ? '' : ''}</p>

    {selected.length > 0 && <div className="pw-bulkbar" role="region" aria-label={t('pw.bulkTitle')}><strong>{t('pj.selectedN', { n: selected.length })}</strong><span className="pw-spacer" /><button type="button" className="rd-btn rd-btn--small" onClick={() => setDialog('bulk')}>{t('pw.editSelected')}</button><button type="button" className="rd-btn rd-btn--soft rd-btn--small" onClick={() => setSelected([])}>{t('pj.clearSelection')}</button></div>}

    {tasks.length === 0 ? <EmptyState art="check" title={t('pw.noTasksTitle')} text={t('pw.noTasksText')}><button type="button" className="rd-btn" onClick={() => openTask(null)} disabled={archived}><Icon name="plus" size={18} />{t('pw.newTask')}</button></EmptyState>
      : layout === 'BOARD' ? <Board rows={rows} />
        : rows.length === 0 ? <EmptyState art="search" title={t('ph.noMatch')}><button type="button" className="rd-btn rd-btn--soft" onClick={() => setFilters(defaultFilters(project.id))}>{t('pj.clearFilters')}</button></EmptyState>
          : layout === 'LIST' ? <TaskList rows={rows} /> : <TaskCalendar rows={rows} />}

    {dialog === 'bulk' && <BulkDialog onClose={() => setDialog(null)} />}
    {dialog === 'labels' && <LabelsDialog onClose={() => setDialog(null)} />}
    {importFile && <ImportDialog file={importFile} onClose={() => setImportFile(null)} />}
  </div>;
}
