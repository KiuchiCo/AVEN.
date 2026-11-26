import { useT } from '../../../../i18n';
import type { ChecklistItem } from '../types';
import { checklistProgress } from '../lib/checklist-progress';
export function ChecklistProgress({ items }: { items: ChecklistItem[] }) {
  const t = useT();
  const progress = checklistProgress(items);
  return <div className="task-checklist-progress"><div><span>{t('td.progress')}</span><strong>{progress.complete}/{progress.total}</strong></div><progress max={100} value={progress.percent} aria-label={t('td.progressAria', { n: progress.percent })} /><small>{t('td.percentDone', { n: progress.percent })}</small></div>;
}
