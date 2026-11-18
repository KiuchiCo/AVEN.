import type { ProjectTemplate, TemplateTask } from '../types';

export type ComparedTask = { ordinal: number; entries: (TemplateTask | null)[]; titleMatches: boolean; scheduleMatches: boolean };

export function compareTemplateTasks(templates: ProjectTemplate[]): ComparedTask[] {
  const rowCount = Math.max(0, ...templates.map((template) => template.taskTemplates.length));
  return Array.from({ length: rowCount }, (_, ordinal) => {
    const entries = templates.map((template) => template.taskTemplates[ordinal] ?? null);
    const titles = new Set(entries.map((entry) => entry?.title.trim().toLocaleLowerCase() ?? ''));
    const offsets = new Set(entries.map((entry) => entry?.daysFromToday ?? null));
    return { ordinal, entries, titleMatches: titles.size === 1, scheduleMatches: offsets.size === 1 };
  });
}
