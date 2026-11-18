import type { ProjectTemplate, TemplateSort } from './types';

export function sortProjectTemplates(templates: ProjectTemplate[], sort: TemplateSort) {
  return [...templates].sort((a, b) => {
    if (sort === 'NAME') return a.name.localeCompare(b.name);
    if (sort === 'MOST_USED') return b.useCount - a.useCount || a.name.localeCompare(b.name);
    if (sort === 'RECENTLY_USED') return (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || a.name.localeCompare(b.name);
    return b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name);
  });
}
