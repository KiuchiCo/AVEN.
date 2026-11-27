import { coachingCatalog } from './coaching-catalog';
import { buildTaskCoaching } from './coaching-text';
import type { TemplateTaskCoaching } from './types';

/** Coaching for one task of a starter template (this module is loaded only when someone opens a task's coaching). */
export async function getTemplateTaskCoaching(presetId: string, taskIndex: number): Promise<TemplateTaskCoaching | null> {
  const preset = coachingCatalog[presetId];
  const title = preset?.tasks[taskIndex];
  return preset && title !== undefined ? buildTaskCoaching(preset.name, title) : null;
}
