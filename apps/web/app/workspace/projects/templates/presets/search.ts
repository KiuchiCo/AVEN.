import type { TemplatePreset } from './types';

export function searchTemplatePresets(presets: TemplatePreset[], query: string, category: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return presets.filter((preset) => {
    if (category !== 'ALL' && preset.category !== category) return false;
    const source = [preset.name, preset.category, preset.description, ...preset.tasks.flatMap((task) => [task.title, task.description ?? '', ...task.labels]), ...preset.milestones.map((milestone) => milestone.title)].join(' ').toLocaleLowerCase();
    return terms.every((term) => source.includes(term));
  });
}
