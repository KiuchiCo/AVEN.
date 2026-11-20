export type TemplateTask = {
  title: string;
  description: string | null;
  priority: string;
  labels: string[];
  daysFromToday: number | null;
  /** Absent on templates saved before start dates existed. */
  startDaysFromToday?: number | null;
  dependsOnIndexes: number[];
};

export type TemplateMilestone = { title: string; daysFromToday: number | null };

export type ProjectTemplate = {
  id: string;
  name: string;
  description: string | null;
  taskCount: number;
  milestoneCount: number;
  taskTemplates: TemplateTask[];
  milestoneTemplates: TemplateMilestone[];
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { displayName: string };
};

export type ProjectTemplateFile = {
  format: 'aven-project-template';
  version: 1;
  exportedAt: string;
  template: Pick<ProjectTemplate, 'name' | 'description' | 'taskTemplates' | 'milestoneTemplates'>;
};

export type TemplateSort = 'UPDATED' | 'NAME' | 'MOST_USED' | 'RECENTLY_USED';
export type TemplateScope = 'ALL' | 'HAS_DEPENDENCIES' | 'HAS_SCHEDULE' | 'HAS_MILESTONES';
