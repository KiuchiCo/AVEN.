import { useT } from '../../../../i18n';
import type { ProjectTemplate } from '../types';

export function TemplateComparisonHeader({ templates }: { templates: ProjectTemplate[] }) {
  const t = useT();
  return <thead><tr><th scope="col">{t('tpl.cmp.feature')}</th>{templates.map((template) => <th scope="col" key={template.id}><span>{template.name}</span><small>{template.description || t('tpl.cmp.noDesc')}</small></th>)}</tr></thead>;
}
