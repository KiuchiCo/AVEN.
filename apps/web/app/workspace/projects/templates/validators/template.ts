import type { ProjectTemplateFile } from '../types';
import { isRecord, optionalDescription, requireName } from './scalar';
import { validateTaskList } from './task-list';
import { validateMilestoneList } from './milestone-list';

export function validateTemplate(value: unknown): ProjectTemplateFile['template'] {
  if (!isRecord(value)) throw new Error('The template file is missing its template data.');
  return { name: requireName(value.name), description: optionalDescription(value.description), taskTemplates: validateTaskList(value.taskTemplates), milestoneTemplates: validateMilestoneList(value.milestoneTemplates) };
}
