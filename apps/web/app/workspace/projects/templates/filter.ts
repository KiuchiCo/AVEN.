import type { ProjectTemplate, TemplateScope } from './types';

export function filterProjectTemplates(templates: ProjectTemplate[], scope: TemplateScope) {
  switch (scope) {
    case 'HAS_DEPENDENCIES': return templates.filter((template) => template.taskTemplates.some((task) => task.dependsOnIndexes.length));
    case 'HAS_SCHEDULE': return templates.filter((template) => template.taskTemplates.some((task) => task.daysFromToday !== null) || template.milestoneTemplates.some((milestone) => milestone.daysFromToday !== null));
    case 'HAS_MILESTONES': return templates.filter((template) => template.milestoneTemplates.length > 0);
    default: return templates;
  }
}
