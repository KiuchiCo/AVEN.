'use client';

import { useEffect, useState } from 'react';
import type { TemplateTaskReadinessDimension, TemplateTaskWorksheet as WorksheetPrompts } from '../presets/task-coaching/types';
import { TaskReadinessReview } from './TaskReadinessReview';

const fields: { key: keyof WorksheetPrompts; title: string; placeholder: string }[] = [
  { key: 'outcome', title: 'Outcome', placeholder: 'Describe the result and how the team will recognize it.' },
  { key: 'owner', title: 'Owner and decision rights', placeholder: 'Name the owner, reviewer, approver, and backup.' },
  { key: 'evidence', title: 'Evidence and source', placeholder: 'Link the source and note collection date and limitations.' },
  { key: 'decisions', title: 'Decisions to make', placeholder: 'List the decision, options, criteria, and decision owner.' },
  { key: 'dependencies', title: 'Dependencies and capacity', placeholder: 'Record dependency, owner, lead time, and escalation date.' },
  { key: 'risks', title: 'Risks and response', placeholder: 'Describe impact, warning signal, response owner, and recovery.' },
  { key: 'review', title: 'Review and acceptance', placeholder: 'Set observable acceptance criteria and required evidence.' },
  { key: 'handoff', title: 'Handoff and follow-up', placeholder: 'Name recipient, destination, open questions, and review date.' },
];

type WorksheetValues = Record<keyof WorksheetPrompts, string>;

function storageKey(presetId: string, taskIndex: number) {
  return `aven:template-workpad:${presetId}:${taskIndex}`;
}

export function TaskWorksheet({ presetId, taskIndex, prompts, readinessRubric }: { presetId: string; taskIndex: number; prompts: WorksheetPrompts; readinessRubric: TemplateTaskReadinessDimension[] }) {
  const [values, setValues] = useState<WorksheetValues>(() => Object.fromEntries(fields.map(({ key }) => [key, ''])) as WorksheetValues);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const key = storageKey(presetId, taskIndex);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) setValues((current) => ({ ...current, ...JSON.parse(stored) }));
    } catch {
      setMessage('This browser could not load a saved worksheet. You can still edit the fields here.');
    }
  }, [key]);

  function updateField(field: keyof WorksheetPrompts, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setSaved(true);
      setMessage('Draft saved in this browser.');
    } catch {
      setSaved(false);
      setMessage('Could not save locally. Copy your notes before closing this page.');
    }
  }

  function clearWorksheet() {
    const blank = Object.fromEntries(fields.map(({ key: field }) => [field, ''])) as WorksheetValues;
    setValues(blank);
    try {
      localStorage.removeItem(key);
      setSaved(false);
      setMessage('Worksheet cleared.');
    } catch {
      setMessage('The worksheet is blank, but this browser could not clear its saved copy.');
    }
  }

  async function copyWorksheet() {
    const content = fields.map(({ key: field, title }) => `${title}\n${values[field] || 'Not recorded'}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(content);
      setMessage('Worksheet copied to the clipboard.');
    } catch {
      setMessage('Clipboard access is unavailable. Select and copy your notes manually.');
    }
  }

  const completed = fields.filter(({ key: field }) => values[field].trim().length > 0).length;

  return (
    <details className="project-template-task-worksheet">
      <summary>Prepare a planning worksheet <span>{completed} of {fields.length} sections filled</span></summary>
      <div className="project-template-task-worksheet__toolbar">
        <p>Draft notes stay in this browser and are not added to your project until you copy them across.</p>
        <div><button type="button" onClick={copyWorksheet}>Copy worksheet</button><button type="button" onClick={clearWorksheet}>Clear</button></div>
      </div>
      <div className="project-template-task-worksheet__fields">
        {fields.map(({ key: field, title, placeholder }) => (
          <label key={field}>
            <span>{title}</span>
            <small>{prompts[field]}</small>
            <textarea value={values[field]} onChange={(event) => updateField(field, event.target.value)} maxLength={2000} placeholder={placeholder} rows={3} />
            <em>{values[field].length} / 2,000</em>
          </label>
        ))}
      </div>
      <TaskReadinessReview presetId={presetId} taskIndex={taskIndex} dimensions={readinessRubric} />
      <p className="project-template-task-worksheet__status" role="status" aria-live="polite">{message || (saved ? 'Draft saved in this browser.' : 'Changes save locally as you type.')}</p>
    </details>
  );
}
