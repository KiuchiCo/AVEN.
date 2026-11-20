'use client';

import { useT } from '../../../../i18n';
import { formatTemplateOffset } from '../offset-label';
import type { TemplateMilestone, TemplateTask } from '../types';

export function TemplateSchedule({ tasks, milestones }: { tasks: TemplateTask[]; milestones: TemplateMilestone[] }) {
  const t = useT();
  const datedTasks = tasks.map((task, index) => ({ ...task, index })).filter((task) => task.daysFromToday !== null).sort((a, b) => a.daysFromToday! - b.daysFromToday!);
  const datedMilestones = milestones.map((milestone, index) => ({ ...milestone, index })).filter((milestone) => milestone.daysFromToday !== null).sort((a, b) => a.daysFromToday! - b.daysFromToday!);
  if (!datedTasks.length && !datedMilestones.length) return <p className="project-template-schedule__empty">{t('tpl.sc.empty')}</p>;
  return <ol className="project-template-schedule">{datedTasks.map((task) => <li key={`task-${task.index}`}><span>{t('tpl.sc.task', { title: task.title })}</span><time>{formatTemplateOffset(task.daysFromToday, t)}</time></li>)}{datedMilestones.map((milestone) => <li key={`milestone-${milestone.index}`}><span>{t('tpl.sc.milestone', { title: milestone.title })}</span><time>{formatTemplateOffset(milestone.daysFromToday, t)}</time></li>)}</ol>;
}
