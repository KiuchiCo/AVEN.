'use client';

import type { ChecklistItem } from '../types';
import { formatTaskDate } from '../lib/format-task-date';

export function ChecklistItemRow({ item, disabled, onToggle, onRename, onRemove }: { item: ChecklistItem; disabled: boolean; onToggle: (item: ChecklistItem) => void; onRename: (item: ChecklistItem) => void; onRemove: (item: ChecklistItem) => void }) {
  return <li className={`task-checklist-row${item.completedAt ? ' is-complete' : ''}`}><label><input type="checkbox" checked={Boolean(item.completedAt)} disabled={disabled} onChange={() => onToggle(item)} /><span>{item.title}</span></label><small>{item.completedAt ? `Completed by ${item.completedBy?.displayName ?? 'a teammate'} · ${formatTaskDate(item.completedAt)}` : `Added by ${item.createdBy.displayName}`}</small><div><button type="button" disabled={disabled} onClick={() => onRename(item)}>Rename</button><button type="button" disabled={disabled} onClick={() => onRemove(item)}>Remove</button></div></li>;
}
