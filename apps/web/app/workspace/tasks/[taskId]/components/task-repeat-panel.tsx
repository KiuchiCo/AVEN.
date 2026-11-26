'use client';

import { useT } from '../../../../i18n';
import type { Key } from '../../../../i18n/en';
import { useState, type FormEvent } from 'react';
import type { TaskSummary } from '../types';


export function TaskRepeatPanel({ task, busy, onSave }: { task: TaskSummary; busy: boolean; onSave: (fields: Record<string, string | number | null>) => void }) {
  const t = useT();
  const [recurrence, setRecurrence] = useState<string>(task.recurrence ?? '');
  const [interval, setInterval] = useState(task.recurrenceInterval || 1);
  const [until, setUntil] = useState(task.recurrenceUntil?.slice(0, 10) ?? '');

  if (task.parent) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(recurrence
      ? { recurrence, recurrenceInterval: interval, recurrenceUntil: until ? `${until}T23:59:59.000Z` : null }
      : { recurrence: null });
  }

  const unit = recurrence ? t(`td.unit.${recurrence}` as Key) : null;
  return <section className="task-repeat" aria-label={t('td.repeat')}>
    <div><p className="workspace-eyebrow">{t('td.repeat')}</p><h2>{t('td.repeatTitle')}</h2></div>
    {!task.dueAt && !task.recurrence ? <p className="task-repeat__note">{t('td.repeatNote')}</p> : <form onSubmit={submit}>
      <label>{t('td.repeat')}<select value={recurrence} disabled={busy} onChange={(event) => setRecurrence(event.target.value)}><option value="">{t('td.noRepeat')}</option><option value="DAILY">{t('td.daily')}</option><option value="WEEKLY">{t('td.weekly')}</option><option value="MONTHLY">{t('td.monthly')}</option></select></label>
      {unit && <label>{t('td.every')}<span className="task-repeat__every"><input type="number" min={1} max={365} value={interval} disabled={busy} onChange={(event) => setInterval(Math.max(1, Math.min(365, Number(event.target.value) || 1)))} />{unit}</span></label>}
      {unit && <label>{t('td.stopAfter')} <span>{t('td.optional')}</span><input type="date" value={until} disabled={busy} onChange={(event) => setUntil(event.target.value)} /></label>}
      <button type="submit" disabled={busy}>{busy ? t('td.saving') : t('td.saveRepeat')}</button>
    </form>}
  </section>;
}
