'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { TaskDependency, TaskSummary } from '../types';

type TaskOption = { id: string; title: string; status: string; project: { id: string; name: string } | null };

export function TaskDependenciesPanel({ task, tasks, busy, onSave }: { task: TaskSummary; tasks: TaskOption[]; busy: boolean; onSave: (ids: string[]) => void }) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  useEffect(() => setSelectedIds(null), [task.id, task.dependsOn]);
  const currentIds = selectedIds ?? task.dependsOn.map((item) => item.id);
  const candidates = useMemo(() => tasks
    .filter((item) => item.id !== task.id && item.project?.id === task.project?.id)
    .filter((item) => item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title)), [search, task.id, task.project?.id, tasks]);
  const dirty = currentIds.length !== task.dependsOn.length || currentIds.some((id) => !task.dependsOn.some((item) => item.id === id));
  const toggle = (id: string) => setSelectedIds((ids) => {
    const current = ids ?? task.dependsOn.map((item) => item.id);
    return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  });
  const taskLink = (dependency: TaskDependency) => <li key={dependency.id}><Link href={`/workspace/tasks/${dependency.id}`}>{dependency.title}</Link><span className={`task-dependency-status task-dependency-status--${dependency.status.toLowerCase()}`}>{dependency.status.replaceAll('_', ' ').toLowerCase()}</span></li>;

  return <section className="task-dependencies-panel">
    <p className="workspace-eyebrow">TASK FLOW</p>
    <h2>Dependencies</h2>
    <p className="task-dependencies-panel__hint">Prerequisites must be completed before this task can be completed.</p>
    {task.dependsOn.length > 0 && <div className="task-dependencies-panel__group"><h3>Blocked by</h3><ul>{task.dependsOn.map(taskLink)}</ul></div>}
    {task.blocks.length > 0 && <div className="task-dependencies-panel__group"><h3>Blocks</h3><ul>{task.blocks.map(taskLink)}</ul></div>}
    {!task.project && <p className="task-dependencies-panel__empty">Add this task to a project to connect it to other tasks.</p>}
    {task.project && <details className="task-dependencies-panel__edit"><summary>Manage prerequisites</summary>
      <label className="task-dependencies-panel__search">Find a task<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this project" /></label>
      {task.status === 'COMPLETED' && <p className="task-dependencies-panel__empty">Reopen this task before adding or changing prerequisites.</p>}
      <div className="task-dependencies-panel__options">{candidates.length ? candidates.map((candidate) => <label key={candidate.id}><input type="checkbox" checked={currentIds.includes(candidate.id)} disabled={busy || task.status === 'COMPLETED'} onChange={() => toggle(candidate.id)} /><span>{candidate.title}</span><small>{candidate.status.replaceAll('_', ' ').toLowerCase()}</small></label>) : <p className="task-dependencies-panel__empty">No matching tasks in this project.</p>}</div>
      <button type="button" disabled={busy || !dirty || task.status === 'COMPLETED'} onClick={() => onSave(currentIds)}>{busy ? 'Saving…' : 'Save prerequisites'}</button>
    </details>}
  </section>;
}
