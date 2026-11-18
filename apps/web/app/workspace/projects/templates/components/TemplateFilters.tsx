import type { TemplateScope, TemplateSort } from '../types';

export function TemplateFilters({ scope, sort, onScope, onSort }: { scope: TemplateScope; sort: TemplateSort; onScope: (value: TemplateScope) => void; onSort: (value: TemplateSort) => void }) {
  return <div className="project-template-filters"><label>Show<select value={scope} onChange={(event) => onScope(event.target.value as TemplateScope)}><option value="ALL">All templates</option><option value="HAS_DEPENDENCIES">With dependencies</option><option value="HAS_SCHEDULE">With schedule</option><option value="HAS_MILESTONES">With milestones</option></select></label><label>Sort<select value={sort} onChange={(event) => onSort(event.target.value as TemplateSort)}><option value="UPDATED">Recently updated</option><option value="NAME">Name</option><option value="MOST_USED">Most used</option><option value="RECENTLY_USED">Recently used</option></select></label></div>;
}
