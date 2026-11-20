'use client';

import { useT } from '../../../../i18n';
import { formatTemplateOffset } from '../offset-label';
import type { TemplateMilestone } from '../types';

export function TemplateMilestonePreview({ milestone, index }: { milestone: TemplateMilestone; index: number }) {
  const t = useT();
  return <li className="project-template-milestone-preview"><span><strong>{index + 1}. {milestone.title}</strong><small>{formatTemplateOffset(milestone.daysFromToday, t)}</small></span><span className="project-template-milestone-preview__marker" aria-hidden="true">◆</span></li>;
}
