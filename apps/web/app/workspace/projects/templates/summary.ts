import type { ProjectTemplate } from './types';

export type TemplateSummary = { tasks: number; milestones: number; dependencies: number; scheduledTasks: number; scheduledMilestones: number; labels: number };

export function summarizeProjectTemplate(template: ProjectTemplate): TemplateSummary {
  return {
    tasks: template.taskTemplates.length,
    milestones: template.milestoneTemplates.length,
    dependencies: template.taskTemplates.reduce((total, task) => total + task.dependsOnIndexes.length, 0),
    scheduledTasks: template.taskTemplates.filter((task) => task.daysFromToday !== null).length,
    scheduledMilestones: template.milestoneTemplates.filter((milestone) => milestone.daysFromToday !== null).length,
    labels: new Set(template.taskTemplates.flatMap((task) => task.labels)).size,
  };
}
