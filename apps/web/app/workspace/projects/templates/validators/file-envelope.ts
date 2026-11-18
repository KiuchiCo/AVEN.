import { TEMPLATE_FILE_FORMAT, TEMPLATE_FILE_VERSION } from '../constants';
import type { ProjectTemplateFile } from '../types';
import { isRecord } from './scalar';
import { validateTemplate } from './template';

export function validateFileEnvelope(value: unknown): ProjectTemplateFile {
  if (!isRecord(value) || value.format !== TEMPLATE_FILE_FORMAT || value.version !== TEMPLATE_FILE_VERSION) throw new Error('This template file uses an unsupported AVEN format or version.');
  return { format: TEMPLATE_FILE_FORMAT, version: TEMPLATE_FILE_VERSION, exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : new Date(0).toISOString(), template: validateTemplate(value.template) };
}
