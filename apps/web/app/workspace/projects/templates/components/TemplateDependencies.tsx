'use client';

import { useT } from '../../../../i18n';
import type { TemplateTask } from '../types';

export function TemplateDependencies({ tasks }: { tasks: TemplateTask[] }) {
  const t = useT();
  const relations = tasks.flatMap((task, index) => task.dependsOnIndexes.map((dependency) => ({ task: task.title || t('tpl.taskN', { n: index + 1 }), prerequisite: tasks[dependency]?.title || t('tpl.taskN', { n: dependency + 1 }) })));
  if (!relations.length) return <p className="project-template-dependencies__empty">{t('tpl.dep.none')}</p>;
  return <ul className="project-template-dependencies">{relations.map((relation, index) => <li key={`${index}-${relation.task}`}><span>{relation.prerequisite}</span><span aria-hidden="true">→</span><strong>{relation.task}</strong></li>)}</ul>;
}
