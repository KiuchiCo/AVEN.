import { TEMPLATE_FILE_MAX_BYTES } from './constants';
import type { ProjectTemplateFile } from './types';
import { validateFileEnvelope } from './validators/file-envelope';

export function parseProjectTemplateFile(source: string): ProjectTemplateFile {
  if (new TextEncoder().encode(source).byteLength > TEMPLATE_FILE_MAX_BYTES) throw new Error('Template files must be smaller than 500 KB.');
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error('This file is not valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('This is not an AVEN project template file.');
  return validateFileEnvelope(value);
}
