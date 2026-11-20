'use client';

import { useT } from '../../../../i18n';
import { summarizeProjectTemplate } from '../summary';
import type { ProjectTemplate } from '../types';

export function TemplateStats({ template }: { template: ProjectTemplate }) {
  const t = useT();
  const stats = summarizeProjectTemplate(template);
  return <dl className="project-template-stats"><div><dt>{t('tpl.st.tasks')}</dt><dd>{stats.tasks}</dd></div><div><dt>{t('tpl.st.milestones')}</dt><dd>{stats.milestones}</dd></div><div><dt>{t('tpl.st.deps')}</dt><dd>{stats.dependencies}</dd></div><div><dt>{t('tpl.st.scheduled')}</dt><dd>{stats.scheduledTasks + stats.scheduledMilestones}</dd></div></dl>;
}
