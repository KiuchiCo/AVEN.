'use client';

import { useT } from '../../../../i18n';
import { useTaskChecklist } from '../hooks/use-task-checklist';
import type { ChecklistItem } from '../types';
import { TaskDetailError } from './task-detail-error';
import { ChecklistComposer } from './checklist-composer';
import { ChecklistItemRow } from './checklist-item-row';
import { ChecklistProgress } from './checklist-progress';

export function ChecklistPanel({ taskId }: { taskId: string }) {
  const t = useT();
  const { items, loading, busy, error, add, toggle, rename, remove, move } = useTaskChecklist(taskId);
  async function renameItem(item: ChecklistItem) { const title = window.prompt(t('td.renamePrompt'), item.title); if (title?.trim()) await rename(item.id, title.trim()); }
  async function removeItem(item: ChecklistItem) { if (window.confirm(t('td.removeConfirm', { title: item.title }))) await remove(item.id); }
  return <section className="task-collab-panel" aria-labelledby="task-checklist-title"><header><div><p className="workspace-eyebrow">{t('td.nextSteps')}</p><h2 id="task-checklist-title">{t('td.tab.checklist')} <span>{items.length}</span></h2></div></header>{error && <TaskDetailError message={error} />}{loading ? <p className="productivity-message">{t('td.loadingChecklist')}</p> : <><ChecklistProgress items={items} />{items.length ? <ol className="task-checklist-list">{items.map((item, index) => <ChecklistItemRow key={item.id} item={item} disabled={busy} canMoveUp={index > 0} canMoveDown={index < items.length - 1} onToggle={toggle} onRename={(row) => void renameItem(row)} onRemove={(row) => void removeItem(row)} onMove={(row, direction) => void move(row.id, direction)} />)}</ol> : <div className="task-collab__empty"><strong>{t('td.noItems')}</strong><p>{t('td.noItemsText')}</p></div>}<ChecklistComposer busy={busy || items.length >= 100} onAdd={add} />{items.length >= 100 && <small>{t('td.maxItems')}</small>}</>}</section>;
}
