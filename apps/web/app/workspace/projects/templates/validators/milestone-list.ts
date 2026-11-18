import type { TemplateMilestone } from '../types';
import { validateMilestone } from './milestone';

export function validateMilestoneList(value: unknown): TemplateMilestone[] {
  if (!Array.isArray(value) || value.length > 50) throw new Error('The template can contain up to 50 milestones.');
  return value.map(validateMilestone);
}
