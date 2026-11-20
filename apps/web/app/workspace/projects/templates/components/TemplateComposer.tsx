'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useT } from '../../../../i18n';
import { TemplateEditor } from './editor/TemplateEditor';
import { summarizeProjectTemplate } from '../summary';
import { templatePresets, findTemplatePreset } from '../presets';
import type { TemplateMilestone, TemplateTask } from '../types';
import type { TemplatePreset } from '../presets/types';
import { TemplatePresetPicker } from './TemplatePresetPicker';

type Props = { busy: boolean; onCreate: (value: { name: string; description: string; taskTemplates: TemplateTask[]; milestoneTemplates: TemplateMilestone[] }) => Promise<void>; onClose: () => void };

function copyPreset(preset: TemplatePreset) {
  return { name: preset.name, description: preset.description, tasks: preset.tasks.map((task) => ({ ...task, labels: [...task.labels], dependsOnIndexes: [...task.dependsOnIndexes] })), milestones: preset.milestones.map((milestone) => ({ ...milestone })) };
}

export function TemplateComposer({ busy, onCreate, onClose }: Props) {
  const t = useT();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tasks, setTasks] = useState<TemplateTask[]>([]);
  const [milestones, setMilestones] = useState<TemplateMilestone[]>([]);
  const [presetId, setPresetId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const selectedPreset = useMemo(() => findTemplatePreset(presetId), [presetId]);
  const draftSummary = { taskTemplates: tasks, milestoneTemplates: milestones };
  const draftStats = summarizeProjectTemplate({ ...draftSummary, id: 'draft', name, description, taskCount: tasks.length, milestoneCount: milestones.length, useCount: 0, lastUsedAt: null, createdAt: '', updatedAt: '', createdBy: { displayName: '' } });

  function loadPreset() {
    if (!selectedPreset) return;
    const draft = copyPreset(selectedPreset);
    setName(draft.name); setDescription(draft.description); setTasks(draft.tasks); setMilestones(draft.milestones); setError(''); setSuccess(t('tpl.cp.loaded', { name: selectedPreset.name }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess('');
    if (tasks.some((task) => !task.title.trim())) { setError(t('tpl.cp.taskTitle')); return; }
    if (milestones.some((milestone) => !milestone.title.trim())) { setError(t('tpl.cp.milestoneTitle')); return; }
    try {
      await onCreate({ name: name.trim(), description: description.trim(), taskTemplates: tasks, milestoneTemplates: milestones });
      setSuccess(t('tpl.cp.added', { name: name.trim() }));
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('tpl.cp.failed')); }
  }

  return <section className="project-template-composer" aria-labelledby="template-composer-title"><header><div><p className="workspace-eyebrow">{t('tpl.cp.eyebrow')}</p><h3 id="template-composer-title">{t('tpl.cp.title')}</h3></div><button type="button" onClick={onClose}>{t('tpl.close')}</button></header><p className="project-template-composer__intro">{t('tpl.cp.intro')}</p><TemplatePresetPicker presets={templatePresets} selectedId={presetId} onSelect={setPresetId} onLoad={loadPreset} /><div className="project-template-composer__stats" aria-live="polite"><span>{t('tpl.cp.statTasks', { n: draftStats.tasks })}</span><span>{t('tpl.cp.statLinks', { n: draftStats.dependencies })}</span><span>{t('tpl.cp.statScheduled', { n: draftStats.scheduledTasks + draftStats.scheduledMilestones })}</span><span>{t('tpl.cp.statMilestones', { n: draftStats.milestones })}</span></div>{error && <p role="alert" className="productivity-error">{error}</p>}{success && <p role="status" className="productivity-success">{success}</p>}<TemplateEditor name={name} description={description} tasks={tasks} milestones={milestones} busy={busy} onName={setName} onDescription={setDescription} onTasks={setTasks} onMilestones={setMilestones} onSubmit={(event) => void submit(event)} onCancel={onClose} title={t('tpl.cp.newTitle')} eyebrow={t('tpl.cp.newEyebrow')} submitLabel={t('tpl.cp.create')} /></section>;
}
