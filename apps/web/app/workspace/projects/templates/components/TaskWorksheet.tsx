'use client';

import { useState } from 'react';
import { useT } from '../../../../i18n';
import type { TemplateTaskReadinessDimension, TemplateTaskWorksheet as WorksheetPrompts } from '../presets/task-coaching/types';
import { TaskReadinessReview } from './TaskReadinessReview';
import { useBrowserStorageValue, writeBrowserStorageValue } from '../browser-storage';

import type { Key } from '../../../../i18n/en';

const fields: { key: keyof WorksheetPrompts; title: Key; placeholder: Key }[] = [
  { key: 'outcome', title: 'tpl.ws.outcome', placeholder: 'tpl.ws.outcomePh' },
  { key: 'owner', title: 'tpl.ws.owner', placeholder: 'tpl.ws.ownerPh' },
  { key: 'evidence', title: 'tpl.ws.evidence', placeholder: 'tpl.ws.evidencePh' },
  { key: 'decisions', title: 'tpl.ws.decisions', placeholder: 'tpl.ws.decisionsPh' },
  { key: 'dependencies', title: 'tpl.ws.dependencies', placeholder: 'tpl.ws.dependenciesPh' },
  { key: 'risks', title: 'tpl.ws.risks', placeholder: 'tpl.ws.risksPh' },
  { key: 'review', title: 'tpl.ws.review', placeholder: 'tpl.ws.reviewPh' },
  { key: 'handoff', title: 'tpl.ws.handoff', placeholder: 'tpl.ws.handoffPh' },
];

type WorksheetValues = Record<keyof WorksheetPrompts, string>;

function storageKey(presetId: string, taskIndex: number) {
  return `aven:template-workpad:${presetId}:${taskIndex}`;
}

export function TaskWorksheet({ presetId, taskIndex, prompts, readinessRubric }: { presetId: string; taskIndex: number; prompts: WorksheetPrompts; readinessRubric: TemplateTaskReadinessDimension[] }) {
  const t = useT();
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const key = storageKey(presetId, taskIndex);
  const storedValues = useBrowserStorageValue(key);
  const blankValues = Object.fromEntries(fields.map(({ key: field }) => [field, ''])) as WorksheetValues;
  let values = blankValues;
  try { if (storedValues) values = { ...blankValues, ...JSON.parse(storedValues) as Partial<WorksheetValues> }; } catch { /* Invalid saved data is ignored and can be overwritten. */ }

  function updateField(field: keyof WorksheetPrompts, value: string) {
    const next = { ...values, [field]: value };
    const success = writeBrowserStorageValue(key, JSON.stringify(next));
    if (success) {
      setSaved(true);
      setMessage(t('tpl.ws.saved'));
    } else {
      setSaved(false);
      setMessage(t('tpl.ws.saveFailed'));
    }
  }

  function clearWorksheet() {
    if (writeBrowserStorageValue(key, null)) {
      setSaved(false);
      setMessage(t('tpl.ws.cleared'));
    } else {
      setMessage(t('tpl.ws.clearFailed'));
    }
  }

  async function copyWorksheet() {
    const content = fields.map(({ key: field, title }) => `${t(title)}\n${values[field] || t('tpl.ws.notRecorded')}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(content);
      setMessage(t('tpl.ws.copied'));
    } catch {
      setMessage(t('tpl.ws.copyFailed'));
    }
  }

  const completed = fields.filter(({ key: field }) => values[field].trim().length > 0).length;

  return (
    <details className="project-template-task-worksheet">
      <summary>{t('tpl.ws.summary')} <span>{t('tpl.ws.filled', { n: completed, total: fields.length })}</span></summary>
      <div className="project-template-task-worksheet__toolbar">
        <p>{t('tpl.ws.hint')}</p>
        <div><button type="button" onClick={copyWorksheet}>{t('tpl.ws.copy')}</button><button type="button" onClick={clearWorksheet}>{t('tpl.ws.clear')}</button></div>
      </div>
      <div className="project-template-task-worksheet__fields">
        {fields.map(({ key: field, title, placeholder }) => (
          <label key={field}>
            <span>{t(title)}</span>
            <small>{prompts[field]}</small>
            <textarea value={values[field]} onChange={(event) => updateField(field, event.target.value)} maxLength={2000} placeholder={t(placeholder)} rows={3} />
            <em>{values[field].length} / 2,000</em>
          </label>
        ))}
      </div>
      <TaskReadinessReview presetId={presetId} taskIndex={taskIndex} dimensions={readinessRubric} />
      <p className="project-template-task-worksheet__status" role="status" aria-live="polite">{message || (saved ? t('tpl.ws.saved') : t('tpl.ws.autosave'))}</p>
    </details>
  );
}
