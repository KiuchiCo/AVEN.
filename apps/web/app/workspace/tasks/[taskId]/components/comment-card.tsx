'use client';

import type { TaskComment } from '../types';
import { formatTaskDate } from '../lib/format-task-date';

export function CommentCard({ comment, canEdit, mentionNames, onEdit, onRemove }: { comment: TaskComment; canEdit: boolean; mentionNames: string[]; onEdit: (comment: TaskComment) => void; onRemove: (comment: TaskComment) => void }) {
  return <article className="task-comment-card"><div className="task-comment-card__avatar" aria-hidden="true">{comment.author.displayName.trim().slice(0, 1).toLocaleUpperCase()}</div><div className="task-comment-card__body"><header><strong>{comment.author.displayName}</strong><time dateTime={comment.createdAt}>{formatTaskDate(comment.createdAt)}{comment.updatedAt !== comment.createdAt ? ' · edited' : ''}</time></header><p>{comment.body}</p>{mentionNames.length > 0 && <small>Mentioned: {mentionNames.join(', ')}</small>}{canEdit && <footer><button type="button" onClick={() => onEdit(comment)}>Edit</button><button type="button" onClick={() => onRemove(comment)}>Delete</button></footer>}</div></article>;
}
