import type { ProjectTemplate } from '../types';

export function labelsByTemplate(template: ProjectTemplate) {
  return template.taskTemplates.map((task) => [...new Set(task.labels)].sort((a, b) => a.localeCompare(b)));
}

export function sharedLabels(templates: ProjectTemplate[]) {
  if (!templates.length) return [];
  const labelSets = templates.map((template) => new Set(template.taskTemplates.flatMap((task) => task.labels)));
  return [...labelSets[0]].filter((label) => labelSets.every((labels) => labels.has(label))).sort((a, b) => a.localeCompare(b));
}

export function unionLabels(templates: ProjectTemplate[]) {
  return [...new Set(templates.flatMap((template) => template.taskTemplates.flatMap((task) => task.labels)))].sort((a, b) => a.localeCompare(b));
}
