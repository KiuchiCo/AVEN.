import type { TemplateMilestone, TemplateTask } from '../types';

export type TemplatePreset = {
  id: string;
  category: 'Product' | 'Research' | 'Marketing' | 'Operations';
  name: string;
  description: string;
  tasks: TemplateTask[];
  milestones: TemplateMilestone[];
};

export function presetTask(title: string, priority: string, offset: number, labels: string[], dependsOnIndexes: number[] = []): TemplateTask {
  return { title, description: null, priority, labels, daysFromToday: offset, dependsOnIndexes };
}
