import type { TemplatePreset } from './types';

export const templatePresetCategories: TemplatePreset['category'][] = ['Product', 'Research', 'Marketing', 'Operations', 'Education', 'Career', 'Personal', 'Finance', 'Health', 'Community'];

export function countPresetsByCategory(presets: TemplatePreset[]) {
  return templatePresetCategories.map((category) => ({ category, count: presets.filter((preset) => preset.category === category).length }));
}
