'use client';

import { useT } from '../../../../i18n';
import { statusKeys } from './task-quick-actions';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { TaskDependency, TaskSummary } from '../types';

type TaskOption = { id: string; title: string; status: string; project: { id: string; name: string } | null };

export function TaskDependenciesPanel({ task, tasks, busy, onSave }: { task: TaskSummary; tasks: TaskOption[]; busy: boolean; onSave: (ids: string[]) => void }) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<{ baseline: string; ids: string[] } | null>(null);
  const baselineIds = task.dependsOn.map((item) => item.id);
  const baseline = [...baselineIds].sort().join('|');
  const currentIds = selection?.baseline === baseline ? selection.ids : baselineIds;
  const candidates = useMemo(() => tasks
    .filter((item) => item.id !== task.id && item.project?.id === task.project?.id)
    .filter((item) => item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title)), [search, task.id, task.project?.id, tasks]);
  const dirty = currentIds.length !== task.dependsOn.length || currentIds.some((id) => !task.dependsOn.some((item) => item.id === id));
  const toggle = (id: string) => setSelection((currentSelection) => {
    const ids = currentSelection?.baseline === baseline ? currentSelection.ids : baselineIds;
    return { baseline, ids: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id] };
  });
  const taskLink = (dependency: TaskDependency) => <li key={dependency.id}><Link href={`/workspace/tasks/${dependency.id}`}>{dependency.title}</Link><span className={`task-dependency-status task-dependency-status--${dependency.status.toLowerCase()}`}>{statusKeys[dependency.status] ? t(statusKeys[dependency.status]) : dependency.status}</span></li>;

  return <section className="task-dependencies-panel">
    <p className="workspace-eyebrow">{t('td.flow')}</p>
    <h2>{t('td.dependencies')}</h2>
    <p className="task-dependencies-panel__hint">{t('td.depHint')}</p>
    {task.dependsOn.length > 0 && <div className="task-dependencies-panel__group"><h3>{t('td.blockedBy')}</h3><ul>{task.dependsOn.map(taskLink)}</ul></div>}
    {task.blocks.length > 0 && <div className="task-dependencies-panel__group"><h3>{t('td.blocks')}</h3><ul>{task.blocks.map(taskLink)}</ul></div>}
    {!task.project && <p className="task-dependencies-panel__empty">{t('td.noProject')}</p>}
    {task.project && <details className="task-dependencies-panel__edit"><summary>{t('td.manage')}</summary>
      <label className="task-dependencies-panel__search">{t('td.findTask')}<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('td.searchProject')} /></label>
      {task.status === 'COMPLETED' && <p className="task-dependencies-panel__empty">{t('td.reopenFirst')}</p>}
      <div className="task-dependencies-panel__options">{candidates.length ? candidates.map((candidate) => <label key={candidate.id}><input type="checkbox" checked={currentIds.includes(candidate.id)} disabled={busy || task.status === 'COMPLETED'} onChange={() => toggle(candidate.id)} /><span>{candidate.title}</span><small>{statusKeys[candidate.status] ? t(statusKeys[candidate.status]) : candidate.status}</small></label>) : <p className="task-dependencies-panel__empty">{t('td.noMatches')}</p>}</div>
      <button type="button" disabled={busy || !dirty || task.status === 'COMPLETED'} onClick={() => onSave(currentIds)}>{busy ? t('td.saving') : t('td.savePrereqs')}</button>
    </details>}
  </section>;
}
