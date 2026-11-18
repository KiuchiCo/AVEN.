'use client';

import { useState, type FormEvent } from 'react';
export function ChecklistComposer({ busy, onAdd }: { busy: boolean; onAdd: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!title.trim()) return; await onAdd(title.trim()); setTitle(''); }
  return <form className="task-checklist-composer" onSubmit={(event) => void submit(event)}><label className="visually-hidden" htmlFor="task-checklist-title">New checklist item</label><input id="task-checklist-title" value={title} maxLength={240} disabled={busy} onChange={(event) => setTitle(event.target.value)} placeholder="Add a checklist item…" /><button type="submit" disabled={busy || !title.trim()}>＋ Add</button></form>;
}
