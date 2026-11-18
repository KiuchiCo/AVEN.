import type { TemplateTask } from '../types';

export function newTemplateTask(): TemplateTask { return { title: '', description: null, priority: 'MEDIUM', labels: [], daysFromToday: null, dependsOnIndexes: [] }; }
