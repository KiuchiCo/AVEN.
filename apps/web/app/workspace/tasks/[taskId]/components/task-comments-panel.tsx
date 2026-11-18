'use client';

import { useTaskComments } from '../hooks/use-task-comments';
import type { TaskComment, WorkspaceMember } from '../types';
import { CommentComposer } from './comment-composer';
import { CommentList } from './comment-list';
import { TaskDetailError } from './task-detail-error';

export function TaskCommentsPanel({ taskId, currentUserId, members }: { taskId: string; currentUserId: string; members: WorkspaceMember[] }) {
  const { comments, loading, busy, error, add, edit, remove } = useTaskComments(taskId);
  async function editComment(comment: TaskComment) { const body = window.prompt('Edit your comment:', comment.body); if (body === null || !body.trim()) return; await edit(comment, body, comment.mentionedUserIds); }
  async function removeComment(comment: TaskComment) { if (window.confirm('Delete this comment?')) await remove(comment.id); }
  return <section className="task-collab-panel" aria-labelledby="task-discussion-title"><header><div><p className="workspace-eyebrow">KEEP EVERYONE IN THE LOOP</p><h2 id="task-discussion-title">Discussion <span>{comments.length}</span></h2></div></header>{error && <TaskDetailError message={error} />}{loading ? <p className="productivity-message">Loading discussion…</p> : <CommentList comments={comments} currentUserId={currentUserId} members={members} onEdit={(comment) => void editComment(comment)} onRemove={(comment) => void removeComment(comment)} />}<CommentComposer members={members} busy={busy} onSubmit={add} /></section>;
}
