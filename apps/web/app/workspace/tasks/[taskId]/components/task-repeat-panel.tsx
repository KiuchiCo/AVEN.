'use client';

import { useState, type FormEvent } from 'react';
import type { TaskSummary } from '../types';

const units = { DAILY: ['day', 'days'], WEEKLY: ['week', 'weeks'], MONTHLY: ['month', 'months'] } as const;

export function TaskRepeatPanel({ task, busy, onSave }: { task: TaskSummary; busy: boolean; onSave: (fields: Record<string, string | number | null>) => void }) {
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

  const unit = recurrence ? units[recurrence as keyof typeof units] : null;
  return <section className="task-repeat" aria-label="Repeat">
    <div><p className="workspace-eyebrow">Repeat</p><h2>Schedule the next one automatically</h2></div>
    {!task.dueAt && !task.recurrence ? <p className="task-repeat__note">Set a due date first. When you complete a repeating task, AVEN creates the next one from its due date.</p> : <form onSubmit={submit}>
      <label>Repeat<select value={recurrence} disabled={busy} onChange={(event) => setRecurrence(event.target.value)}><option value="">Does not repeat</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select></label>
      {unit && <label>Every<span className="task-repeat__every"><input type="number" min={1} max={365} value={interval} disabled={busy} onChange={(event) => setInterval(Math.max(1, Math.min(365, Number(event.target.value) || 1)))} />{interval === 1 ? unit[0] : unit[1]}</span></label>}
      {unit && <label>Stop after <span>(optional)</span><input type="date" value={until} disabled={busy} onChange={(event) => setUntil(event.target.value)} /></label>}
      <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save repeat'}</button>
    </form>}
  </section>;
}
