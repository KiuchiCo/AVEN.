'use client';

import { useT } from '../../../../i18n';
import { useState, type FormEvent } from 'react';
import type { TaskSummary } from '../types';

type Draft = { title: string; description: string };

function fromTask(task: TaskSummary): Draft {
  return { title: task.title, description: task.description ?? '' };
}

/** Title and description, edited in place under the task's heading. The assignee is changed in the side panel. */
export function TaskEditPanel({ task, busy, onSave }: { task: TaskSummary; busy: boolean; onSave: (fields: Record<string, string | null>) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => fromTask(task));
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) { setError(t('td.err.title')); return; }
    if (title.length > 200) { setError(t('td.err.titleLong')); return; }
    if (draft.description.length > 5000) { setError(t('td.err.descLong')); return; }
    setError('');
    onSave({ title, description: draft.description.trim() || null });
    setOpen(false);
  }

  return (
    <section className={`task-edit-panel${open ? ' is-open' : ''}`} aria-label={t('td.detailsAria')}>
      {!open && <button type="button" className="rd-btn rd-btn--soft rd-btn--small" aria-expanded={false} onClick={() => { setError(''); setDraft(fromTask(task)); setOpen(true); }}>{t('td.editDetails')}</button>}
      {open && <form className="task-edit-panel__form" onSubmit={submit} onKeyDown={(event) => { if (event.key === 'Escape') { setDraft(fromTask(task)); setError(''); setOpen(false); } }}>
        <label>{t('td.title')}<input autoFocus required maxLength={200} value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} /></label>
        <label>{t('td.description')} <span>{t('td.optional')}</span><textarea rows={4} maxLength={5000} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} placeholder={t('td.descPh')} /><small>{draft.description.length} / 5,000</small></label>
        {error && <p role="alert" className="productivity-error">{error}</p>}
        <div className="task-edit-panel__actions"><button type="button" disabled={busy} onClick={() => { setDraft(fromTask(task)); setError(''); setOpen(false); }}>{t('td.cancel')}</button><button type="submit" disabled={busy}>{busy ? t('td.saving') : t('td.saveDetails')}</button></div>
      </form>}
    </section>
  );
}
