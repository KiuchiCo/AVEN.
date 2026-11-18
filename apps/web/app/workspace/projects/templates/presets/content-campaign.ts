import type { TemplatePreset } from './types';
import { presetTask } from './types';

export const contentCampaignPreset: TemplatePreset = {
  id: 'content-campaign', category: 'Marketing', name: 'Content campaign', description: 'Coordinate campaign strategy, production, review, and measurement.',
  tasks: [
    presetTask('Agree audience, message, and campaign objective', 'HIGH', 0, ['strategy']),
    presetTask('Build channel plan and publishing calendar', 'MEDIUM', 4, ['planning'], [0]),
    presetTask('Draft creative and supporting content', 'HIGH', 10, ['production'], [0, 1]),
    presetTask('Review claims, links, and brand details', 'URGENT', 14, ['review'], [2]),
    presetTask('Publish campaign assets', 'HIGH', 17, ['launch'], [3]),
    presetTask('Review performance and capture learnings', 'MEDIUM', 31, ['analysis'], [4]),
  ],
  milestones: [{ title: 'Campaign brief confirmed', daysFromToday: 4 }, { title: 'Creative approved', daysFromToday: 15 }, { title: 'Performance review', daysFromToday: 31 }],
};
