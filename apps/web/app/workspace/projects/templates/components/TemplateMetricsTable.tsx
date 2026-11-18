import { measureTemplate } from '../compare/metrics';
import type { ProjectTemplate } from '../types';
import { TemplateComparisonHeader } from './TemplateComparisonHeader';

export function TemplateMetricsTable({ templates }: { templates: ProjectTemplate[] }) {
  const metrics = templates.map(measureTemplate);
  const rows: [string, (number | string | null)[]][] = [
    ['Tasks', metrics.map((item) => item.taskCount)],
    ['Milestones', metrics.map((item) => item.milestoneCount)],
    ['Prerequisite links', metrics.map((item) => item.dependencyCount)],
    ['Tasks with due dates', metrics.map((item) => item.datedTaskCount)],
    ['Milestones with due dates', metrics.map((item) => item.datedMilestoneCount)],
    ['Unique labels', metrics.map((item) => item.labelCount)],
    ['Schedule span (days)', metrics.map((item) => item.estimatedSpan)],
    ['Times used', templates.map((item) => item.useCount)],
  ];
  return <div className="project-template-comparison__table-wrap"><table className="project-template-comparison__table"><TemplateComparisonHeader templates={templates} /><tbody>{rows.map(([label, values]) => <tr key={label}><th scope="row">{label}</th>{values.map((value, index) => <td key={`${label}-${templates[index].id}`}>{value === null ? '—' : value}</td>)}</tr>)}</tbody></table></div>;
}
