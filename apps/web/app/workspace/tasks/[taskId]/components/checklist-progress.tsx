import type { ChecklistItem } from '../types';
import { checklistProgress } from '../lib/checklist-progress';
export function ChecklistProgress({ items }: { items: ChecklistItem[] }) {
  const progress = checklistProgress(items);
  return <div className="task-checklist-progress"><div><span>Checklist progress</span><strong>{progress.complete}/{progress.total}</strong></div><progress max={100} value={progress.percent} aria-label={`${progress.percent}% checklist complete`} /><small>{progress.percent}% complete</small></div>;
}
