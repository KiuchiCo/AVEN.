'use client';

import { useT } from '../../../../i18n';
import { compareTemplateMilestones } from '../compare/milestone-diff';
import { formatTemplateOffset } from '../offset-label';
import type { ProjectTemplate } from '../types';

export function TemplateMilestoneComparison({ templates }: { templates: ProjectTemplate[] }) {
  const t = useT();
  const rows = compareTemplateMilestones(templates);
  if (!rows.length) return <p>{t('tpl.cmp.noMilestones')}</p>;
  return <div className="project-template-comparison__table-wrap"><table className="project-template-comparison__table"><thead><tr><th scope="col">{t('tpl.cmp.order')}</th>{templates.map((template) => <th key={template.id} scope="col">{template.name}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.ordinal}><th scope="row">{t('tpl.cmp.milestoneN', { n: row.ordinal + 1 })}</th>{row.entries.map((milestone, index) => <td key={`${row.ordinal}-${templates[index].id}`}>{milestone ? <><strong>{milestone.title}</strong><small>{formatTemplateOffset(milestone.daysFromToday, t)}</small></> : <span className="project-template-comparison__missing">{t('tpl.cmp.noMilestoneHere')}</span>}</td>)}</tr>)}</tbody></table></div>;
}
