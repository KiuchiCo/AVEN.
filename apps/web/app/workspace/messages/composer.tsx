'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import { useFilesApi } from '../files/use-files-api';
import { activeMention, mentionToken } from './mention-text';
import { Icon } from '../home-icons';

type Member = { userId: string; displayName: string };

/** A message box with an @mention picker. Enter sends, Shift+Enter adds a line. */
export function Composer({ label, members, selfId, onSend, compact = false }: { label: string; members: Member[]; selfId: string; onSend: (body: string, fileIds: string[]) => Promise<void>; compact?: boolean }) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState('');
  const { upload } = useFilesApi();
  const field = useRef<HTMLTextAreaElement>(null);
  const typing = activeMention(draft, caret);
  const options = typing ? members.filter((member) => member.userId !== selfId && member.displayName.toLowerCase().includes(typing.query)).slice(0, 6) : [];

  function choose(member: Member) {
    if (!typing) return;
    const inserted = mentionToken(member.displayName, member.userId);
    setDraft(draft.slice(0, typing.start) + inserted + draft.slice(caret)); setPick(0);
    requestAnimationFrame(() => { const end = typing.start + inserted.length; field.current?.focus(); field.current?.setSelectionRange(end, end); setCaret(end); });
  }
  async function submit(event?: FormEvent) {
    event?.preventDefault(); const body = draft.trim(); if ((!body && !files.length) || uploading) return;
    try { await onSend(body, files.map((file) => file.id)); setDraft(''); setCaret(0); setFiles([]); } catch { /* the page shows the error and the text stays */ }
  }

  async function attach(selected: File[]) {
    setProblem(''); setUploading(true);
    try {
      const added: { id: string; name: string }[] = [];
      for (const file of selected.slice(0, 5 - files.length)) { const saved = await upload(file); added.push({ id: saved.id, name: saved.name }); }
      setFiles((current) => [...current, ...added]);
    } catch (reason) { setProblem(reason instanceof Error ? reason.message : 'The file could not be uploaded.'); }
    finally { setUploading(false); }
  }

  return <form className="chat-compose" onSubmit={submit}>
    <label className="visually-hidden" htmlFor={`composer-${label}`}>{label}</label>
    <div className="chat-compose__field">
      {options.length > 0 && <ul className="chat-mentions" role="listbox" aria-label={t('msg.mention')}>{options.map((member, index) => <li key={member.userId} role="option" aria-selected={index === pick}><button type="button" onMouseDown={(event) => { event.preventDefault(); choose(member); }}>{member.displayName}</button></li>)}</ul>}
      <textarea ref={field} id={`composer-${label}`} value={draft} maxLength={4000} rows={compact ? 2 : 2} placeholder={t('msg.placeholder', { label })}
        onChange={(event) => { setDraft(event.target.value); setCaret(event.target.selectionStart); setPick(0); }} onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        onKeyDown={(event) => {
          if (options.length) {
            if (event.key === 'ArrowDown') { event.preventDefault(); setPick((pick + 1) % options.length); return; }
            if (event.key === 'ArrowUp') { event.preventDefault(); setPick((pick + options.length - 1) % options.length); return; }
            if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); choose(options[pick]); return; }
            if (event.key === 'Escape') { event.preventDefault(); setCaret(0); return; }
          }
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); }
        }} />
    </div>
    {(files.length > 0 || problem) && <ul className="chat-compose__files" aria-label={t('msg.filesAria')}>{files.map((file) => <li key={file.id}>{file.name} <button type="button" aria-label={t('msg.removeFile', { name: file.name })} onClick={() => setFiles(files.filter((item) => item.id !== file.id))}>×</button></li>)}{problem && <li role="alert">{problem}</li>}</ul>}
    <div className="chat-compose__bar">
      <button type="button" className="rd-iconbtn rd-iconbtn--boxed" aria-label={t('msg.mentionBtn')} onClick={() => { const at = field.current?.selectionStart ?? draft.length; const next = `${draft.slice(0, at)}@${draft.slice(at)}`; setDraft(next); requestAnimationFrame(() => { field.current?.focus(); field.current?.setSelectionRange(at + 1, at + 1); setCaret(at + 1); }); }}><Icon name="users" size={18} /></button>
      <label className="rd-iconbtn rd-iconbtn--boxed chat-compose__attach" aria-disabled={uploading || files.length >= 5} title={uploading ? t('msg.uploading') : t('msg.attach')}><Icon name="attach" size={18} /><span className="visually-hidden">{uploading ? t('msg.uploading') : t('msg.attach')}</span><input type="file" multiple disabled={uploading || files.length >= 5} onChange={(event) => { const selected = [...(event.target.files ?? [])]; event.target.value = ''; if (selected.length) void attach(selected); }} /></label>
      <span className="chat-compose__hint">{t('msg.sendHint')}</span>
      <button type="submit" className="rd-btn" disabled={(!draft.trim() && !files.length) || uploading}><Icon name="send" size={18} />{t('msg.send')}</button>
    </div>
  </form>;
}
