import type { TemplatePreset } from './types';
import { presetTask } from './types';

export const websiteLaunchPreset: TemplatePreset = {
  id: 'website-launch', category: 'Product', name: 'Website launch', description: 'A practical path from project kickoff through QA and launch.',
  tasks: [
    presetTask('Confirm goals, audience, and success measures', 'HIGH', 0, ['discovery']),
    presetTask('Approve sitemap and page content', 'HIGH', 7, ['content'], [0]),
    presetTask('Complete visual design and responsive states', 'HIGH', 14, ['design'], [0]),
    presetTask('Build pages and connect content', 'URGENT', 28, ['development'], [1, 2]),
    presetTask('Run accessibility, browser, and performance checks', 'HIGH', 38, ['quality'], [3]),
    presetTask('Publish and monitor the launch', 'MEDIUM', 45, ['launch'], [4]),
  ],
  milestones: [{ title: 'Project brief approved', daysFromToday: 7 }, { title: 'Design sign-off', daysFromToday: 18 }, { title: 'Launch day', daysFromToday: 45 }],
};
