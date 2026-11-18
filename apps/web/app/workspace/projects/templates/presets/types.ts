import type { TemplateMilestone, TemplateTask } from '../types';

export type TemplatePreset = {
  id: string;
  category: 'Product' | 'Research' | 'Marketing' | 'Operations' | 'Education' | 'Career' | 'Personal' | 'Finance' | 'Health' | 'Community';
  name: string;
  description: string;
  tasks: TemplateTask[];
  milestones: TemplateMilestone[];
  operatingGuide?: TemplatePresetGuide;
};

export type TemplatePresetGuide = {
  preparation: string[];
  qualityChecks: string[];
  riskSignals: string[];
  handoff: string[];
};

export function presetTask(title: string, priority: string, offset: number, labels: string[], dependsOnIndexes: number[] = [], description: string | null = null): TemplateTask {
  return { title, description, priority, labels, daysFromToday: offset, dependsOnIndexes };
}
