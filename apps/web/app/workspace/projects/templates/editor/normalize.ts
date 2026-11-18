import type { ProjectTemplate, TemplateMilestone, TemplateTask } from '../types';

export function templateDraft(template: ProjectTemplate): { name: string; description: string; tasks: TemplateTask[]; milestones: TemplateMilestone[] } {
  return { name: template.name, description: template.description ?? '', tasks: template.taskTemplates.map((task) => ({ ...task, daysFromToday: task.daysFromToday ?? null, dependsOnIndexes: task.dependsOnIndexes ?? [] })), milestones: template.milestoneTemplates.map((milestone) => ({ ...milestone, daysFromToday: milestone.daysFromToday ?? null })) };
}
