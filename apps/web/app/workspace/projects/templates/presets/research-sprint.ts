import type { TemplatePreset } from './types';
import { presetTask } from './types';

export const researchSprintPreset: TemplatePreset = {
  id: 'research-sprint', category: 'Research', name: 'Research sprint', description: 'Plan a focused research cycle from question framing to recommendations.',
  tasks: [
    presetTask('Write the research question and decision context', 'HIGH', 0, ['planning']),
    presetTask('Choose methods and recruit participants', 'HIGH', 3, ['method'], [0]),
    presetTask('Prepare discussion guide and consent materials', 'MEDIUM', 6, ['preparation'], [1]),
    presetTask('Run interviews or research sessions', 'URGENT', 12, ['fieldwork'], [2]),
    presetTask('Synthesize themes and evidence', 'HIGH', 18, ['analysis'], [3]),
    presetTask('Share findings and recommended next steps', 'HIGH', 22, ['reporting'], [4]),
  ],
  milestones: [{ title: 'Research plan approved', daysFromToday: 3 }, { title: 'Fieldwork complete', daysFromToday: 17 }, { title: 'Findings shared', daysFromToday: 22 }],
};
