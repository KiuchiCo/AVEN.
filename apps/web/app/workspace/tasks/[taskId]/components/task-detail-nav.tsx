import { useT } from '../../../../i18n';
import type { Key } from '../../../../i18n/en';
import { taskCollaborationTabs, type TaskCollaborationTab } from '../lib/task-collaboration-tabs';

export function TaskDetailNav({ active, onChange }: { active: TaskCollaborationTab; onChange: (tab: TaskCollaborationTab) => void }) {
  const t = useT();
  return <nav className="task-detail__tabs" aria-label={t('td.tabsAria')}>{taskCollaborationTabs.map((tab) => <button type="button" key={tab.id} aria-current={active === tab.id ? 'page' : undefined} className={active === tab.id ? 'is-active' : ''} onClick={() => onChange(tab.id)}>{t(`td.tab.${tab.id}` as Key)}</button>)}</nav>;
}
