import type { ProjectTemplate, TemplateMilestone } from '../types';

export type ComparedMilestone = { ordinal: number; entries: (TemplateMilestone | null)[]; titleMatches: boolean; scheduleMatches: boolean };

export function compareTemplateMilestones(templates: ProjectTemplate[]): ComparedMilestone[] {
  const rowCount = Math.max(0, ...templates.map((template) => template.milestoneTemplates.length));
  return Array.from({ length: rowCount }, (_, ordinal) => {
    const entries = templates.map((template) => template.milestoneTemplates[ordinal] ?? null);
    const titles = new Set(entries.map((entry) => entry?.title.trim().toLocaleLowerCase() ?? ''));
    const offsets = new Set(entries.map((entry) => entry?.daysFromToday ?? null));
    return { ordinal, entries, titleMatches: titles.size === 1, scheduleMatches: offsets.size === 1 };
  });
}
