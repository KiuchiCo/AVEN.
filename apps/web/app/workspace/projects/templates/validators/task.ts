import type { TemplateTask } from '../types';
import { isRecord } from './scalar';
import { validateOffset } from './offset';
import { TEMPLATE_MAX_LABELS_PER_TASK, TEMPLATE_MAX_LABEL_LENGTH } from '../constants';

const priorities = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export function validateTask(value: unknown, index: number): TemplateTask {
  if (!isRecord(value)) throw new Error(`Task ${index + 1} must be an object.`);
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200) throw new Error(`Task ${index + 1} needs a title of 1–200 characters.`);
  if (value.description !== null && value.description !== undefined && (typeof value.description !== 'string' || value.description.length > 5000)) throw new Error(`Task ${index + 1} description is too long.`);
  if (typeof value.priority !== 'string' || !priorities.has(value.priority)) throw new Error(`Task ${index + 1} has an unsupported priority.`);
  if (!Array.isArray(value.labels) || value.labels.length > TEMPLATE_MAX_LABELS_PER_TASK || value.labels.some((label) => typeof label !== 'string' || label.length > TEMPLATE_MAX_LABEL_LENGTH || !/^[\p{L}\p{N}_-]+$/u.test(label))) throw new Error(`Task ${index + 1} labels must be at most ${TEMPLATE_MAX_LABELS_PER_TASK} labels of ${TEMPLATE_MAX_LABEL_LENGTH} letters, numbers, underscores, or hyphens.`);
  if (!Array.isArray(value.dependsOnIndexes)) throw new Error(`Task ${index + 1} prerequisites must be a list.`);
  const dependencies = value.dependsOnIndexes.map((dependency) => {
    if (!Number.isInteger(dependency) || (dependency as number) < 0 || (dependency as number) >= 100 || dependency === index) throw new Error(`Task ${index + 1} has an invalid prerequisite reference.`);
    return dependency as number;
  });
  if (new Set(dependencies).size !== dependencies.length) throw new Error(`Task ${index + 1} has a duplicate prerequisite.`);
  return { title: value.title.trim(), description: (value.description as string | null | undefined) ?? null, priority: value.priority, labels: value.labels as string[], daysFromToday: validateOffset(value.daysFromToday), dependsOnIndexes: dependencies };
}
