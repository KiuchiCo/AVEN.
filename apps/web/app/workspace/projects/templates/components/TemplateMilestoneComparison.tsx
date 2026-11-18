import { compareTemplateMilestones } from '../compare/milestone-diff';
import { formatTemplateOffset } from '../offset-label';
import type { ProjectTemplate } from '../types';

export function TemplateMilestoneComparison({ templates }: { templates: ProjectTemplate[] }) {
  const rows = compareTemplateMilestones(templates);
  if (!rows.length) return <p>None of the selected templates includes milestones.</p>;
  return <div className="project-template-comparison__table-wrap"><table className="project-template-comparison__table"><thead><tr><th scope="col">Order</th>{templates.map((template) => <th key={template.id} scope="col">{template.name}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.ordinal}><th scope="row">Milestone {row.ordinal + 1}</th>{row.entries.map((milestone, index) => <td key={`${row.ordinal}-${templates[index].id}`}>{milestone ? <><strong>{milestone.title}</strong><small>{formatTemplateOffset(milestone.daysFromToday)}</small></> : <span className="project-template-comparison__missing">No milestone at this position</span>}</td>)}</tr>)}</tbody></table></div>;
}
