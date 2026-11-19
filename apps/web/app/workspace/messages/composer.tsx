'use client';

import { useRef, useState, type FormEvent } from 'react';
import { activeMention, mentionToken } from './mention-text';

type Member = { userId: string; displayName: string };

/** A message box with an @mention picker. Enter sends, Shift+Enter adds a line. */
export function Composer({ label, members, selfId, onSend, compact = false }: { label: string; members: Member[]; selfId: string; onSend: (body: string) => Promise<void>; compact?: boolean }) {
  const [draft, setDraft] = useState('');
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
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
    event?.preventDefault(); const body = draft.trim(); if (!body) return;
    try { await onSend(body); setDraft(''); setCaret(0); } catch { /* the page shows the error and the text stays */ }
  }

  return <form className="chat-compose" onSubmit={submit}>
    <label className="visually-hidden" htmlFor={`composer-${label}`}>{label}</label>
    <div className="chat-compose__field">
      {options.length > 0 && <ul className="chat-mentions" role="listbox" aria-label="Mention someone">{options.map((member, index) => <li key={member.userId} role="option" aria-selected={index === pick}><button type="button" onMouseDown={(event) => { event.preventDefault(); choose(member); }}>{member.displayName}</button></li>)}</ul>}
      <textarea ref={field} id={`composer-${label}`} value={draft} maxLength={4000} rows={compact ? 2 : 2} placeholder={`${label} · type @ to mention`}
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
    <button className="workspace-settings-save" disabled={!draft.trim()}>Send</button>
  </form>;
}
