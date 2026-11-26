'use client';

import { useT } from '../../../../i18n';
import type { ChecklistItem } from '../types';
import { formatTaskDate } from '../lib/format-task-date';

export function ChecklistItemRow({ item, disabled, canMoveUp, canMoveDown, onToggle, onRename, onRemove, onMove }: { item: ChecklistItem; disabled: boolean; canMoveUp: boolean; canMoveDown: boolean; onToggle: (item: ChecklistItem) => void; onRename: (item: ChecklistItem) => void; onRemove: (item: ChecklistItem) => void; onMove: (item: ChecklistItem, direction: 'UP' | 'DOWN') => void }) {
  const t = useT();
  return <li className={`task-checklist-row${item.completedAt ? ' is-complete' : ''}`}><label><input type="checkbox" checked={Boolean(item.completedAt)} disabled={disabled} onChange={() => onToggle(item)} /><span>{item.title}</span></label><small>{item.completedAt ? t('td.completedBy', { name: item.completedBy?.displayName ?? t('td.aTeammate'), date: formatTaskDate(item.completedAt) }) : t('td.addedBy', { name: item.createdBy.displayName })}</small><div><button type="button" aria-label={t('td.moveUpAria', { title: item.title })} title={t('td.moveUp')} disabled={disabled || !canMoveUp} onClick={() => onMove(item, 'UP')}>↑</button><button type="button" aria-label={t('td.moveDownAria', { title: item.title })} title={t('td.moveDown')} disabled={disabled || !canMoveDown} onClick={() => onMove(item, 'DOWN')}>↓</button><button type="button" disabled={disabled} onClick={() => onRename(item)}>{t('td.rename')}</button><button type="button" disabled={disabled} onClick={() => onRemove(item)}>{t('td.remove')}</button></div></li>;
}
