import type { ProjectTemplate } from '../types';

export type TemplateMetrics = {
  taskCount: number;
  milestoneCount: number;
  dependencyCount: number;
  datedTaskCount: number;
  datedMilestoneCount: number;
  labelCount: number;
  estimatedSpan: number | null;
};

export function measureTemplate(template: ProjectTemplate): TemplateMetrics {
  const offsets = [
    ...template.taskTemplates.map((task) => task.daysFromToday),
    ...template.milestoneTemplates.map((milestone) => milestone.daysFromToday),
  ].filter((offset): offset is number => offset !== null);
  return {
    taskCount: template.taskTemplates.length,
    milestoneCount: template.milestoneTemplates.length,
    dependencyCount: template.taskTemplates.reduce((count, task) => count + task.dependsOnIndexes.length, 0),
    datedTaskCount: template.taskTemplates.filter((task) => task.daysFromToday !== null).length,
    datedMilestoneCount: template.milestoneTemplates.filter((milestone) => milestone.daysFromToday !== null).length,
    labelCount: new Set(template.taskTemplates.flatMap((task) => task.labels)).size,
    estimatedSpan: offsets.length ? Math.max(...offsets) - Math.min(...offsets) : null,
  };
}

export function metricDifference(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  return left - right;
}
