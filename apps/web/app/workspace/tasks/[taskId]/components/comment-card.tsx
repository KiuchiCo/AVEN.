'use client';

'use client';

import { useState, type FormEvent } from 'react';
import type { TaskComment } from '../types';
import { formatTaskDate } from '../lib/format-task-date';
import { validateComment } from '../lib/comment-validation';
import { MemberPicker } from './member-picker';
import type { WorkspaceMember } from '../types';

export function CommentCard({ comment, canEdit, disabled, members, mentionNames, onEdit, onRemove }: { comment: TaskComment; canEdit: boolean; disabled: boolean; members: WorkspaceMember[]; mentionNames: string[]; onEdit: (comment: TaskComment, body: string, mentions: string[]) => Promise<boolean>; onRemove: (comment: TaskComment) => void }) {
  const [editing, setEditing] = useState(false); const [body, setBody] = useState(comment.body); const [mentions, setMentions] = useState(comment.mentionedUserIds); const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const issue = validateComment(body, mentions.length); if (issue) { setError(issue); return; } setError(''); if (await onEdit(comment, body.trim(), mentions)) setEditing(false); }
  function cancelEdit() { setBody(comment.body); setMentions(comment.mentionedUserIds); setError(''); setEditing(false); }
  return <article className="task-comment-card"><div className="task-comment-card__avatar" aria-hidden="true">{comment.author.displayName.trim().slice(0, 1).toLocaleUpperCase()}</div><div className="task-comment-card__body"><header><strong>{comment.author.displayName}</strong><time dateTime={comment.createdAt}>{formatTaskDate(comment.createdAt)}{comment.updatedAt !== comment.createdAt ? ' · edited' : ''}</time></header>{editing ? <form className="task-comment-edit" onSubmit={(event) => void save(event)}><label htmlFor={`edit-comment-${comment.id}`}>Edit comment</label><textarea id={`edit-comment-${comment.id}`} value={body} maxLength={2000} rows={4} disabled={disabled} onChange={(event) => setBody(event.target.value)} /><MemberPicker members={members} selected={mentions} onChange={setMentions} disabled={disabled} />{error && <p className="task-collab__form-error" role="alert">{error}</p>}<div><small>{body.length}/2000</small><span><button type="button" disabled={disabled} onClick={cancelEdit}>Cancel</button><button type="submit" disabled={disabled}>{disabled ? 'Saving…' : 'Save changes'}</button></span></div></form> : <><p>{comment.body}</p>{mentionNames.length > 0 && <small>Mentioned: {mentionNames.join(', ')}</small>}{canEdit && <footer><button type="button" disabled={disabled} onClick={() => { setBody(comment.body); setMentions(comment.mentionedUserIds); setEditing(true); }}>Edit</button><button type="button" disabled={disabled} onClick={() => onRemove(comment)}>Delete</button></footer>}</>}</div></article>;
}
