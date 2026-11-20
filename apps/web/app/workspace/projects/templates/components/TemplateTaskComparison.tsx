'use client';

import { useT } from '../../../../i18n';
import { compareTemplateTasks } from '../compare/task-diff';
import { formatTemplateOffset } from '../offset-label';
import type { Key } from '../../../../i18n/en';
import type { ProjectTemplate } from '../types';

export function TemplateTaskComparison({ templates }: { templates: ProjectTemplate[] }) {
  const t = useT();
  const rows = compareTemplateTasks(templates);
  if (!rows.length) return <p>{t('tpl.cmp.noTasks')}</p>;
  return <div className="project-template-comparison__table-wrap"><table className="project-template-comparison__table project-template-comparison__tasks"><thead><tr><th scope="col">{t('tpl.cmp.order')}</th>{templates.map((template) => <th key={template.id} scope="col">{template.name}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.ordinal}><th scope="row">{t('tpl.cmp.taskN', { n: row.ordinal + 1 })}</th>{row.entries.map((task, index) => <td key={`${row.ordinal}-${templates[index].id}`} className={!row.titleMatches ? 'project-template-comparison__different' : ''}>{task ? <><strong>{task.title}</strong><span>{t('tpl.cmp.priority', { priority: t(`prio.${task.priority.toLowerCase()}` as Key) })}</span><small>{formatTemplateOffset(task.daysFromToday, t)}{task.dependsOnIndexes.length ? ` · ${t(task.dependsOnIndexes.length === 1 ? 'tpl.prereqOne' : 'tpl.prereqMany', { n: task.dependsOnIndexes.length })}` : ''}</small>{task.labels.length > 0 && <small>{task.labels.map((label) => `#${label}`).join(' ')}</small>}</> : <span className="project-template-comparison__missing">{t('tpl.cmp.noTaskHere')}</span>}</td>)}</tr>)}</tbody></table></div>;
}
