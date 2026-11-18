import type { ChecklistItem } from '../types';

export function checklistProgress(items: ChecklistItem[]) {
  const complete = items.filter((item) => Boolean(item.completedAt)).length;
  return { complete, total: items.length, percent: items.length ? Math.round((complete / items.length) * 100) : 0 };
}
