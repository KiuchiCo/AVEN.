import type { TemplateTask } from '../types';

export function TemplateDependencies({ tasks }: { tasks: TemplateTask[] }) {
  const relations = tasks.flatMap((task, index) => task.dependsOnIndexes.map((dependency) => ({ task: task.title || `Task ${index + 1}`, prerequisite: tasks[dependency]?.title || `Task ${dependency + 1}` })));
  if (!relations.length) return <p className="project-template-dependencies__empty">No task prerequisites.</p>;
  return <ul className="project-template-dependencies">{relations.map((relation, index) => <li key={`${index}-${relation.task}`}><span>{relation.prerequisite}</span><span aria-hidden="true">→</span><strong>{relation.task}</strong></li>)}</ul>;
}
