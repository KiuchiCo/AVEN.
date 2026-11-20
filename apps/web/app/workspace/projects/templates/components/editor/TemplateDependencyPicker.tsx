'use client';

import { useT } from '../../../../../i18n';
import type { TemplateTask } from '../../types';

export function TemplateDependencyPicker({ tasks, onChange }: { tasks: TemplateTask[]; onChange: (index: number, dependencies: number[]) => void }) {
  const t = useT();
  return <fieldset className="project-template-dependency-picker"><legend>{t('tpl.ed.prereqLegend')}</legend>{tasks.map((task, index) => <label key={index}><span>{task.title || t('tpl.taskN', { n: index + 1 })}</span><select aria-label={t('tpl.ed.prereqAria', { title: task.title || t('tpl.taskN', { n: index + 1 }) })} multiple size={Math.min(4, Math.max(2, tasks.length - 1))} value={task.dependsOnIndexes.map(String)} onChange={(event) => onChange(index, [...event.currentTarget.selectedOptions].map((option) => Number(option.value)))}>{tasks.map((candidate, candidateIndex) => candidateIndex !== index && <option key={candidateIndex} value={candidateIndex}>{candidate.title || t('tpl.taskN', { n: candidateIndex + 1 })}</option>)}</select></label>)}<small>{t('tpl.ed.prereqHint')}</small></fieldset>;
}
