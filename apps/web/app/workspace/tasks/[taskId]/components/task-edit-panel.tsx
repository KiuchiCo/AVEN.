'use client';

import { useT } from '../../../../i18n';
import { useState, type FormEvent } from 'react';
import type { TaskSummary, WorkspaceMember } from '../types';

type Draft = { title: string; description: string; assigneeId: string };

function fromTask(task: TaskSummary): Draft {
  return { title: task.title, description: task.description ?? '', assigneeId: task.assignee?.id ?? '' };
}

export function TaskEditPanel({ task, members, busy, onSave }: { task: TaskSummary; members: WorkspaceMember[]; busy: boolean; onSave: (fields: Record<string, string | null>) => void }) {
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
    onSave({ title, description: draft.description.trim() || null, assigneeId: draft.assigneeId || null });
    setOpen(false);
  }

  return (
    <section className="task-edit-panel" aria-label={t('td.detailsAria')}>
      <div className="task-edit-panel__heading"><div><p className="workspace-eyebrow">{t('td.detailsAria')}</p><h2>{t('td.editTitle')}</h2></div><button type="button" aria-expanded={open} onClick={() => { setError(''); if (!open) setDraft(fromTask(task)); setOpen((value) => !value); }}>{open ? t('td.closeEditor') : t('td.editDetails')}</button></div>
      {open && <form className="task-edit-panel__form" onSubmit={submit}>
        <label>{t('td.title')}<input autoFocus required maxLength={200} value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} /></label>
        <label>{t('td.description')} <span>{t('td.optional')}</span><textarea rows={4} maxLength={5000} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} placeholder={t('td.descPh')} /><small>{draft.description.length} / 5,000</small></label>
        <label>{t('td.assignee')}<select value={draft.assigneeId} onChange={(event) => setDraft((value) => ({ ...value, assigneeId: event.target.value }))}><option value="">{t('td.unassigned')}</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label>
        {error && <p role="alert" className="productivity-error">{error}</p>}
        <div className="task-edit-panel__actions"><button type="button" disabled={busy} onClick={() => { setDraft(fromTask(task)); setError(''); setOpen(false); }}>{t('td.cancel')}</button><button type="submit" disabled={busy}>{busy ? t('td.saving') : t('td.saveDetails')}</button></div>
      </form>}
    </section>
  );
}
