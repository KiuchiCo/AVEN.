'use client';

import { useState, type FormEvent } from 'react';
import { validateComment } from '../lib/comment-validation';
import { MemberPicker } from './member-picker';
import type { WorkspaceMember } from '../types';

export function CommentComposer({ members, busy, onSubmit }: { members: WorkspaceMember[]; busy: boolean; onSubmit: (body: string, mentions: string[]) => Promise<void> }) {
  const [body, setBody] = useState(''); const [mentions, setMentions] = useState<string[]>([]); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const issue = validateComment(body, mentions.length); if (issue) { setError(issue); return; } setError(''); await onSubmit(body.trim(), mentions); setBody(''); setMentions([]); }
  return <form className="task-comment-composer" onSubmit={(event) => void submit(event)}><label htmlFor="task-comment-body">Add to the discussion</label><textarea id="task-comment-body" value={body} maxLength={2000} rows={4} disabled={busy} onChange={(event) => setBody(event.target.value)} placeholder="Share an update or ask a question…" /><MemberPicker members={members} selected={mentions} onChange={setMentions} disabled={busy} />{error && <p className="task-collab__form-error" role="alert">{error}</p>}<div><small>{body.length}/2000</small><button type="submit" disabled={busy}>{busy ? 'Posting…' : 'Post comment'}</button></div></form>;
}
