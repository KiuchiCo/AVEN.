'use client';

import { useMemo, useState, type FormEvent } from 'react';
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
    setName(draft.name); setDescription(draft.description); setTasks(draft.tasks); setMilestones(draft.milestones); setError(''); setSuccess(`${selectedPreset.name} starter loaded. You can change every field before saving.`);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess('');
    if (tasks.some((task) => !task.title.trim())) { setError('Give every starter task a title before saving.'); return; }
    if (milestones.some((milestone) => !milestone.title.trim())) { setError('Give every milestone a title before saving.'); return; }
    try {
      await onCreate({ name: name.trim(), description: description.trim(), taskTemplates: tasks, milestoneTemplates: milestones });
      setSuccess(`“${name.trim()}” was added to your template library.`);
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create this template.'); }
  }

  return <section className="project-template-composer" aria-labelledby="template-composer-title"><header><div><p className="workspace-eyebrow">START WITH A BLANK TEMPLATE OR A CHECKLIST</p><h3 id="template-composer-title">Create a reusable project plan</h3></div><button type="button" onClick={onClose}>Close</button></header><p className="project-template-composer__intro">Create your own repeatable workflow. Tasks, prerequisite links, labels, priorities, relative due dates, and milestones will be saved together.</p><TemplatePresetPicker presets={templatePresets} selectedId={presetId} onSelect={setPresetId} onLoad={loadPreset} /><div className="project-template-composer__stats" aria-live="polite"><span>{draftStats.tasks} tasks</span><span>{draftStats.dependencies} prerequisite links</span><span>{draftStats.scheduledTasks + draftStats.scheduledMilestones} scheduled items</span><span>{draftStats.milestones} milestones</span></div>{error && <p role="alert" className="productivity-error">{error}</p>}{success && <p role="status" className="productivity-success">{success}</p>}<TemplateEditor name={name} description={description} tasks={tasks} milestones={milestones} busy={busy} onName={setName} onDescription={setDescription} onTasks={setTasks} onMilestones={setMilestones} onSubmit={(event) => void submit(event)} onCancel={onClose} title="New project template" eyebrow="CREATE A REUSABLE WORKFLOW" submitLabel="Create template" /></section>;
}
