import { formatTemplateOffset } from '../offset-label';
import type { TemplateMilestone } from '../types';

export function TemplateMilestonePreview({ milestone, index }: { milestone: TemplateMilestone; index: number }) {
  return <li className="project-template-milestone-preview"><span><strong>{index + 1}. {milestone.title}</strong><small>{formatTemplateOffset(milestone.daysFromToday, 'day')}</small></span><span className="project-template-milestone-preview__marker" aria-hidden="true">◆</span></li>;
}
