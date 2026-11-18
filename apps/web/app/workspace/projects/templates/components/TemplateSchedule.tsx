import { formatTemplateOffset } from '../offset-label';
import type { TemplateMilestone, TemplateTask } from '../types';

export function TemplateSchedule({ tasks, milestones }: { tasks: TemplateTask[]; milestones: TemplateMilestone[] }) {
  const datedTasks = tasks.map((task, index) => ({ ...task, index })).filter((task) => task.daysFromToday !== null).sort((a, b) => a.daysFromToday! - b.daysFromToday!);
  const datedMilestones = milestones.map((milestone, index) => ({ ...milestone, index })).filter((milestone) => milestone.daysFromToday !== null).sort((a, b) => a.daysFromToday! - b.daysFromToday!);
  if (!datedTasks.length && !datedMilestones.length) return <p className="project-template-schedule__empty">No relative dates in this template.</p>;
  return <ol className="project-template-schedule">{datedTasks.map((task) => <li key={`task-${task.index}`}><span>Task · {task.title}</span><time>{formatTemplateOffset(task.daysFromToday)}</time></li>)}{datedMilestones.map((milestone) => <li key={`milestone-${milestone.index}`}><span>Milestone · {milestone.title}</span><time>{formatTemplateOffset(milestone.daysFromToday)}</time></li>)}</ol>;
}
