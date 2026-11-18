import type { TemplateTask } from '../types';

export function removeTemplateTask(tasks: TemplateTask[], index: number) {
  return tasks.filter((_, current) => current !== index).map((task) => ({ ...task, dependsOnIndexes: task.dependsOnIndexes.filter((dependency) => dependency !== index).map((dependency) => dependency > index ? dependency - 1 : dependency) }));
}
