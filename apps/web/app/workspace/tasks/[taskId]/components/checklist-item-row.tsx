'use client';

import type { ChecklistItem } from '../types';
import { formatTaskDate } from '../lib/format-task-date';

export function ChecklistItemRow({ item, disabled, canMoveUp, canMoveDown, onToggle, onRename, onRemove, onMove }: { item: ChecklistItem; disabled: boolean; canMoveUp: boolean; canMoveDown: boolean; onToggle: (item: ChecklistItem) => void; onRename: (item: ChecklistItem) => void; onRemove: (item: ChecklistItem) => void; onMove: (item: ChecklistItem, direction: 'UP' | 'DOWN') => void }) {
  return <li className={`task-checklist-row${item.completedAt ? ' is-complete' : ''}`}><label><input type="checkbox" checked={Boolean(item.completedAt)} disabled={disabled} onChange={() => onToggle(item)} /><span>{item.title}</span></label><small>{item.completedAt ? `Completed by ${item.completedBy?.displayName ?? 'a teammate'} · ${formatTaskDate(item.completedAt)}` : `Added by ${item.createdBy.displayName}`}</small><div><button type="button" aria-label={`Move ${item.title} up`} title="Move up" disabled={disabled || !canMoveUp} onClick={() => onMove(item, 'UP')}>↑</button><button type="button" aria-label={`Move ${item.title} down`} title="Move down" disabled={disabled || !canMoveDown} onClick={() => onMove(item, 'DOWN')}>↓</button><button type="button" disabled={disabled} onClick={() => onRename(item)}>Rename</button><button type="button" disabled={disabled} onClick={() => onRemove(item)}>Remove</button></div></li>;
}
