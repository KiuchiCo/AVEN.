import { taskCollaborationTabs, type TaskCollaborationTab } from '../lib/task-collaboration-tabs';

export function TaskDetailNav({ active, onChange }: { active: TaskCollaborationTab; onChange: (tab: TaskCollaborationTab) => void }) {
  return <nav className="task-detail__tabs" aria-label="Task collaboration sections">{taskCollaborationTabs.map((tab) => <button type="button" key={tab.id} aria-current={active === tab.id ? 'page' : undefined} className={active === tab.id ? 'is-active' : ''} onClick={() => onChange(tab.id)}>{tab.label}</button>)}</nav>;
}
