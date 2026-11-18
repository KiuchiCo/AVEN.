import { summarizeProjectTemplate } from '../summary';
import type { ProjectTemplate } from '../types';

export function TemplateStats({ template }: { template: ProjectTemplate }) {
  const stats = summarizeProjectTemplate(template);
  return <dl className="project-template-stats"><div><dt>Tasks</dt><dd>{stats.tasks}</dd></div><div><dt>Milestones</dt><dd>{stats.milestones}</dd></div><div><dt>Dependencies</dt><dd>{stats.dependencies}</dd></div><div><dt>Scheduled</dt><dd>{stats.scheduledTasks + stats.scheduledMilestones}</dd></div></dl>;
}
