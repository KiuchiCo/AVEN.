import type { TemplateMilestone } from '../types';
import { isRecord } from './scalar';
import { validateOffset } from './offset';

export function validateMilestone(value: unknown, index: number): TemplateMilestone {
  if (!isRecord(value) || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 160) throw new Error(`Milestone ${index + 1} needs a title of 1–160 characters.`);
  return { title: value.title.trim(), daysFromToday: validateOffset(value.daysFromToday) };
}
