import { useT } from '../../../../i18n';
import { measureTemplate } from '../compare/metrics';
import type { Key } from '../../../../i18n/en';
import type { ProjectTemplate } from '../types';
import { TemplateComparisonHeader } from './TemplateComparisonHeader';

export function TemplateMetricsTable({ templates }: { templates: ProjectTemplate[] }) {
  const t = useT();
  const metrics = templates.map(measureTemplate);
  const rows: [Key, (number | string | null)[]][] = [
    ['tpl.m.tasks', metrics.map((item) => item.taskCount)],
    ['tpl.m.milestones', metrics.map((item) => item.milestoneCount)],
    ['tpl.m.links', metrics.map((item) => item.dependencyCount)],
    ['tpl.m.datedTasks', metrics.map((item) => item.datedTaskCount)],
    ['tpl.m.datedMilestones', metrics.map((item) => item.datedMilestoneCount)],
    ['tpl.m.labels', metrics.map((item) => item.labelCount)],
    ['tpl.m.span', metrics.map((item) => item.estimatedSpan)],
    ['tpl.m.used', templates.map((item) => item.useCount)],
  ];
  return <div className="project-template-comparison__table-wrap"><table className="project-template-comparison__table"><TemplateComparisonHeader templates={templates} /><tbody>{rows.map(([label, values]) => <tr key={label}><th scope="row">{t(label)}</th>{values.map((value, index) => <td key={`${label}-${templates[index].id}`}>{value === null ? '—' : value}</td>)}</tr>)}</tbody></table></div>;
}
