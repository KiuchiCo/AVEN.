import { compareTemplateTasks } from '../compare/task-diff';
import { formatTemplateOffset } from '../offset-label';
import type { ProjectTemplate } from '../types';

export function TemplateTaskComparison({ templates }: { templates: ProjectTemplate[] }) {
  const rows = compareTemplateTasks(templates);
  if (!rows.length) return <p>None of the selected templates includes tasks.</p>;
  return <div className="project-template-comparison__table-wrap"><table className="project-template-comparison__table project-template-comparison__tasks"><thead><tr><th scope="col">Order</th>{templates.map((template) => <th key={template.id} scope="col">{template.name}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.ordinal}><th scope="row">Task {row.ordinal + 1}</th>{row.entries.map((task, index) => <td key={`${row.ordinal}-${templates[index].id}`} className={!row.titleMatches ? 'project-template-comparison__different' : ''}>{task ? <><strong>{task.title}</strong><span>{task.priority.toLocaleLowerCase()} priority</span><small>{formatTemplateOffset(task.daysFromToday)}{task.dependsOnIndexes.length ? ` · ${task.dependsOnIndexes.length} prerequisites` : ''}</small>{task.labels.length > 0 && <small>{task.labels.map((label) => `#${label}`).join(' ')}</small>}</> : <span className="project-template-comparison__missing">No task at this position</span>}</td>)}</tr>)}</tbody></table></div>;
}
