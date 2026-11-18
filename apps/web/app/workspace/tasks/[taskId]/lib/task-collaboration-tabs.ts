export const taskCollaborationTabs = [
  { id: 'discussion', label: 'Discussion' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'activity', label: 'Activity' },
] as const;
export type TaskCollaborationTab = (typeof taskCollaborationTabs)[number]['id'];
