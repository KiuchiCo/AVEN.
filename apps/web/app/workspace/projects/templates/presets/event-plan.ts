import type { TemplatePreset } from './types';
import { presetTask } from './types';

export const eventPlanPreset: TemplatePreset = {
  id: 'event-plan', category: 'Operations', name: 'Event plan', description: 'A reusable checklist for preparing, running, and reviewing an event.',
  tasks: [
    presetTask('Set the event purpose, date, and budget', 'URGENT', 0, ['planning']),
    presetTask('Book venue and confirm accessibility needs', 'HIGH', 7, ['venue'], [0]),
    presetTask('Confirm speakers, partners, and run sheet', 'HIGH', 14, ['program'], [0]),
    presetTask('Send invitations and publish event information', 'MEDIUM', 18, ['communications'], [1, 2]),
    presetTask('Prepare equipment and attendee materials', 'HIGH', 27, ['logistics'], [3]),
    presetTask('Host the event and record follow-up actions', 'URGENT', 30, ['delivery'], [4]),
    presetTask('Review feedback and close the budget', 'MEDIUM', 36, ['wrap-up'], [5]),
  ],
  milestones: [{ title: 'Venue and date locked', daysFromToday: 7 }, { title: 'Registration closes', daysFromToday: 25 }, { title: 'Event day', daysFromToday: 30 }, { title: 'Event review complete', daysFromToday: 36 }],
};
