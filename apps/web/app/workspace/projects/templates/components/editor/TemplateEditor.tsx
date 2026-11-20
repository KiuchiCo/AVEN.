'use client';

import type { FormEvent } from 'react';
import { useT } from '../../../../../i18n';
import { replaceAt } from '../../editor/replace-at';
import { removeTemplateTask } from '../../editor/remove-task';
import { newTemplateTask } from '../../editor/new-task';
import { newTemplateMilestone } from '../../editor/new-milestone';
import type { TemplateMilestone, TemplateTask } from '../../types';
import { TemplateEditorHeading } from './TemplateEditorHeading';
import { TemplateTaskRow } from './TemplateTaskRow';
import { TemplateDependencyPicker } from './TemplateDependencyPicker';
import { TemplateMilestoneRow } from './TemplateMilestoneRow';
import styles from './TemplateEditor.module.css';

type Props = { name: string; description: string; tasks: TemplateTask[]; milestones: TemplateMilestone[]; busy: boolean; onName: (name: string) => void; onDescription: (description: string) => void; onTasks: (tasks: TemplateTask[]) => void; onMilestones: (milestones: TemplateMilestone[]) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void; title?: string; eyebrow?: string; submitLabel?: string };

export function TemplateEditor({ name, description, tasks, milestones, busy, onName, onDescription, onTasks, onMilestones, onSubmit, onCancel, title, eyebrow, submitLabel }: Props) {
  const t = useT();
  function setDependencies(index: number, dependsOnIndexes: number[]) { onTasks(replaceAt(tasks, index, { ...tasks[index], dependsOnIndexes })); }
  return <form className={`project-template-editor ${styles.form}`} onSubmit={onSubmit}><TemplateEditorHeading onCancel={onCancel} title={title} eyebrow={eyebrow} /><label>{t('tpl.ed.name')}<input required maxLength={160} value={name} onChange={(event) => onName(event.target.value)} /></label><label>{t('tpl.ed.description')}<textarea maxLength={5000} rows={2} value={description} onChange={(event) => onDescription(event.target.value)} /></label><section className="project-template-editor__section"><div><strong>{t('tpl.ed.tasksHeading')}</strong><button type="button" disabled={tasks.length >= 100} onClick={() => onTasks([...tasks, newTemplateTask()])}>{t('tpl.ed.addTask')}</button></div>{tasks.length ? tasks.map((task, index) => <TemplateTaskRow key={index} task={task} index={index} onEdit={(value) => onTasks(replaceAt(tasks, index, value))} onRemove={() => onTasks(removeTemplateTask(tasks, index))} />) : <p>{t('tpl.ed.noTasks')}</p>}{tasks.length > 1 && <TemplateDependencyPicker tasks={tasks} onChange={setDependencies} />}</section><section className="project-template-editor__section"><div><strong>{t('tpl.milestones')}</strong><button type="button" disabled={milestones.length >= 50} onClick={() => onMilestones([...milestones, newTemplateMilestone()])}>{t('tpl.ed.addMilestone')}</button></div>{milestones.length ? milestones.map((milestone, index) => <TemplateMilestoneRow key={index} milestone={milestone} index={index} onEdit={(value) => onMilestones(replaceAt(milestones, index, value))} onRemove={() => onMilestones(milestones.filter((_, current) => current !== index))} />) : <p>{t('tpl.ed.noMilestones')}</p>}</section><button className="project-template-editor__save" type="submit" disabled={busy}>{busy ? t('tpl.ed.saving') : submitLabel ?? t('tpl.ed.save')}</button></form>;
}
