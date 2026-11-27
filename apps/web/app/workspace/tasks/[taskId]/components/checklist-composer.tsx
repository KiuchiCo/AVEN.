'use client';

import { useT } from '../../../../i18n';
import { useState, type FormEvent } from 'react';
export function ChecklistComposer({ busy, onAdd }: { busy: boolean; onAdd: (title: string) => Promise<void> }) {
  const t = useT();
  const [title, setTitle] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!title.trim()) return; await onAdd(title.trim()); setTitle(''); }
  return <form className="task-checklist-composer" onSubmit={(event) => void submit(event)}><label className="visually-hidden" htmlFor="task-checklist-new">{t('td.newItem')}</label><input id="task-checklist-new" value={title} maxLength={240} disabled={busy} onChange={(event) => setTitle(event.target.value)} placeholder={t('td.newItemPh')} /><button type="submit" disabled={busy || !title.trim()}>{t('td.add')}</button></form>;
}
