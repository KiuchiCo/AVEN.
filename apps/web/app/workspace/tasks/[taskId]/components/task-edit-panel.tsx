'use client';

import { useState, type FormEvent } from 'react';
import type { TaskSummary, WorkspaceMember } from '../types';

type Draft = { title: string; description: string; assigneeId: string };

function fromTask(task: TaskSummary): Draft {
  return { title: task.title, description: task.description ?? '', assigneeId: task.assignee?.id ?? '' };
}

export function TaskEditPanel({ task, members, busy, onSave }: { task: TaskSummary; members: WorkspaceMember[]; busy: boolean; onSave: (fields: Record<string, string | null>) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => fromTask(task));
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) { setError('Enter a task title.'); return; }
    if (title.length > 200) { setError('Task titles can be up to 200 characters.'); return; }
    if (draft.description.length > 5000) { setError('Descriptions can be up to 5,000 characters.'); return; }
    setError('');
    onSave({ title, description: draft.description.trim() || null, assigneeId: draft.assigneeId || null });
    setOpen(false);
  }

  return (
    <section className="task-edit-panel" aria-label="Task details">
      <div className="task-edit-panel__heading"><div><p className="workspace-eyebrow">TASK DETAILS</p><h2>Title, description, and owner</h2></div><button type="button" aria-expanded={open} onClick={() => { setError(''); if (!open) setDraft(fromTask(task)); setOpen((value) => !value); }}>{open ? 'Close editor' : 'Edit details'}</button></div>
      {open && <form className="task-edit-panel__form" onSubmit={submit}>
        <label>Task title<input autoFocus required maxLength={200} value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} /></label>
        <label>Description <span>(optional)</span><textarea rows={4} maxLength={5000} value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} placeholder="Add context, expected outcome, or acceptance notes." /><small>{draft.description.length} / 5,000</small></label>
        <label>Assignee<select value={draft.assigneeId} onChange={(event) => setDraft((value) => ({ ...value, assigneeId: event.target.value }))}><option value="">Unassigned</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}</select></label>
        {error && <p role="alert" className="productivity-error">{error}</p>}
        <div className="task-edit-panel__actions"><button type="button" disabled={busy} onClick={() => { setDraft(fromTask(task)); setError(''); setOpen(false); }}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save task details'}</button></div>
      </form>}
    </section>
  );
}
