import type { ProjectTemplate } from './types';

export function searchProjectTemplates(templates: ProjectTemplate[], query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return templates;
  return templates.filter((template) => {
    const searchable = [template.name, template.description ?? '', ...template.taskTemplates.map((task) => `${task.title} ${task.description ?? ''} ${task.labels.join(' ')}`), ...template.milestoneTemplates.map((milestone) => milestone.title)].join(' ').toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}
