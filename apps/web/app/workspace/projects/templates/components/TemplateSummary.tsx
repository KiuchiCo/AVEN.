import type { ProjectTemplate } from '../types';
import { summarizeProjectTemplate } from '../summary';

export function TemplateSummary({ template }: { template: ProjectTemplate }) {
  const summary = summarizeProjectTemplate(template);
  const labels = template.taskTemplates.flatMap((task) => task.labels);
  return <p className="project-template-summary">{summary.tasks} tasks · {summary.milestones} milestones · {summary.dependencies} prerequisite links{summary.labels ? ` · ${summary.labels} unique labels` : ''}{labels.length ? ` · ${[...new Set(labels)].slice(0, 3).map((label) => `#${label}`).join(' ')}` : ''}</p>;
}
