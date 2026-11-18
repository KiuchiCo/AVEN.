import type { TemplatePreset } from './types';
import { contentCampaignPreset } from './content-campaign';
import { eventPlanPreset } from './event-plan';
import { hiringPlanPreset } from './hiring-plan';
import { researchSprintPreset } from './research-sprint';
import { websiteLaunchPreset } from './website-launch';
import { extendedTemplatePresets } from './extended-catalog';

export const templatePresets: TemplatePreset[] = [websiteLaunchPreset, researchSprintPreset, contentCampaignPreset, eventPlanPreset, hiringPlanPreset, ...extendedTemplatePresets];

export function findTemplatePreset(id: string) {
  return templatePresets.find((preset) => preset.id === id) ?? null;
}
