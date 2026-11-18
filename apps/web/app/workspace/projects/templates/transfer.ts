import type { ProjectTemplate } from './types';
import { serializeProjectTemplate } from './serialize';
import { projectTemplateFilename } from './filename';

export function downloadProjectTemplate(template: ProjectTemplate) {
  const blob = new Blob([JSON.stringify(serializeProjectTemplate(template), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = projectTemplateFilename(template.name);
  anchor.click();
  URL.revokeObjectURL(url);
}
