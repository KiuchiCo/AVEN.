'use client';

import { useTaskChecklist } from '../hooks/use-task-checklist';
import type { ChecklistItem } from '../types';
import { TaskDetailError } from './task-detail-error';
import { ChecklistComposer } from './checklist-composer';
import { ChecklistItemRow } from './checklist-item-row';
import { ChecklistProgress } from './checklist-progress';

export function ChecklistPanel({ taskId }: { taskId: string }) {
  const { items, loading, busy, error, add, toggle, rename, remove, move } = useTaskChecklist(taskId);
  async function renameItem(item: ChecklistItem) { const title = window.prompt('Rename checklist item:', item.title); if (title?.trim()) await rename(item.id, title.trim()); }
  async function removeItem(item: ChecklistItem) { if (window.confirm(`Remove “${item.title}” from the checklist?`)) await remove(item.id); }
  return <section className="task-collab-panel" aria-labelledby="task-checklist-title"><header><div><p className="workspace-eyebrow">Break down the next steps</p><h2 id="task-checklist-title">Checklist <span>{items.length}</span></h2></div></header>{error && <TaskDetailError message={error} />}{loading ? <p className="productivity-message">Loading checklist…</p> : <><ChecklistProgress items={items} />{items.length ? <ol className="task-checklist-list">{items.map((item, index) => <ChecklistItemRow key={item.id} item={item} disabled={busy} canMoveUp={index > 0} canMoveDown={index < items.length - 1} onToggle={toggle} onRename={(row) => void renameItem(row)} onRemove={(row) => void removeItem(row)} onMove={(row, direction) => void move(row.id, direction)} />)}</ol> : <div className="task-collab__empty"><strong>No checklist items yet</strong><p>Break this task into clear steps and track them as you go.</p></div>}<ChecklistComposer busy={busy || items.length >= 100} onAdd={add} />{items.length >= 100 && <small>A checklist can have up to 100 items.</small>}</>}</section>;
}
