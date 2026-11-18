import { TEMPLATE_FILE_FORMAT, TEMPLATE_FILE_VERSION } from './constants';
import type { ProjectTemplate, ProjectTemplateFile } from './types';

export function serializeProjectTemplate(template: ProjectTemplate): ProjectTemplateFile {
  return {
    format: TEMPLATE_FILE_FORMAT,
    version: TEMPLATE_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    template: {
      name: template.name,
      description: template.description,
      taskTemplates: template.taskTemplates,
      milestoneTemplates: template.milestoneTemplates,
    },
  };
}
