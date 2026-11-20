'use client';

import { useT } from '../../../../i18n';
import { TemplatePriority } from './TemplatePriority';
import { TemplateLabels } from './TemplateLabels';
import { formatTemplateOffset } from '../offset-label';
import type { TemplateTask } from '../types';

export function TemplateTaskPreview({ task, index }: { task: TemplateTask; index: number }) {
  const t = useT();
  return <li className="project-template-task-preview"><div><strong>{index + 1}. {task.title}</strong><TemplatePriority value={task.priority} /><TemplateLabels labels={task.labels} /></div>{task.description && <p>{task.description}</p>}<small>{formatTemplateOffset(task.daysFromToday, t)}{task.dependsOnIndexes.length ? ` · ${t(task.dependsOnIndexes.length === 1 ? 'tpl.prereqOne' : 'tpl.prereqMany', { n: task.dependsOnIndexes.length })}` : ''}</small></li>;
}
