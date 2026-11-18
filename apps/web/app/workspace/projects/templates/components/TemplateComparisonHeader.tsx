import type { ProjectTemplate } from '../types';

export function TemplateComparisonHeader({ templates }: { templates: ProjectTemplate[] }) {
  return <thead><tr><th scope="col">Feature</th>{templates.map((template) => <th scope="col" key={template.id}><span>{template.name}</span><small>{template.description || 'No description provided'}</small></th>)}</tr></thead>;
}
