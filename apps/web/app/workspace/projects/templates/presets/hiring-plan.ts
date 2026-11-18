import type { TemplatePreset } from './types';
import { presetTask } from './types';

export const hiringPlanPreset: TemplatePreset = {
  id: 'hiring-plan', category: 'Operations', name: 'Hiring plan', description: 'Keep a hiring process consistent from role approval to onboarding.',
  tasks: [
    presetTask('Confirm role scope, level, and approval', 'HIGH', 0, ['role-definition']),
    presetTask('Write the position description and scorecard', 'HIGH', 4, ['preparation'], [0]),
    presetTask('Publish the role and begin candidate review', 'MEDIUM', 8, ['sourcing'], [1]),
    presetTask('Run structured interviews and collect feedback', 'HIGH', 18, ['interviews'], [2]),
    presetTask('Make a decision and complete reference checks', 'URGENT', 25, ['decision'], [3]),
    presetTask('Prepare offer and first-week onboarding plan', 'HIGH', 29, ['onboarding'], [4]),
  ],
  milestones: [{ title: 'Role approved', daysFromToday: 0 }, { title: 'Interview loop complete', daysFromToday: 22 }, { title: 'Offer decision', daysFromToday: 27 }],
};
