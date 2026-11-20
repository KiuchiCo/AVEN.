'use client';

import { useT } from '../../../../i18n';
import type { ProjectTemplate } from '../types';
import { summarizeProjectTemplate } from '../summary';

export function TemplateSummary({ template }: { template: ProjectTemplate }) {
  const t = useT();
  const summary = summarizeProjectTemplate(template);
  const labels = template.taskTemplates.flatMap((task) => task.labels);
  return <p className="project-template-summary">{t('tpl.sm.line', { tasks: summary.tasks, milestones: summary.milestones, deps: summary.dependencies })}{summary.labels ? t('tpl.sm.labels', { n: summary.labels }) : ''}{labels.length ? ` · ${[...new Set(labels)].slice(0, 3).map((label) => `#${label}`).join(' ')}` : ''}</p>;
}
