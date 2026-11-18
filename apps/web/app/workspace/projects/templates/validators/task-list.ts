import type { TemplateTask } from '../types';
import { validateTask } from './task';

export function validateTaskList(value: unknown): TemplateTask[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('The template can contain up to 100 tasks.');
  const tasks = value.map(validateTask);
  for (const [index, task] of tasks.entries()) for (const dependency of task.dependsOnIndexes) if (dependency >= tasks.length) throw new Error(`Task ${index + 1} refers to a prerequisite that is not in the file.`);
  function reaches(from: number, target: number, visited: Set<number>): boolean {
    if (from === target) return true;
    if (visited.has(from)) return false;
    visited.add(from);
    return tasks[from].dependsOnIndexes.some((dependency) => reaches(dependency, target, visited));
  }
  for (const [index, task] of tasks.entries()) if (task.dependsOnIndexes.some((dependency) => reaches(dependency, index, new Set()))) throw new Error('The template contains a prerequisite cycle.');
  return tasks;
}
