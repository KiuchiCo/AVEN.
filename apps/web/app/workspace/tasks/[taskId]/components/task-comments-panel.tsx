'use client';

import { useMemo, useState } from 'react';
import { useTaskComments } from '../hooks/use-task-comments';
import type { TaskComment, WorkspaceMember } from '../types';
import { CommentComposer } from './comment-composer';
import { CommentList } from './comment-list';
import { TaskDetailError } from './task-detail-error';

export function TaskCommentsPanel({ taskId, currentUserId, members }: { taskId: string; currentUserId: string; members: WorkspaceMember[] }) {
  const { comments, loading, busy, error, add, edit, remove } = useTaskComments(taskId);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<'oldest' | 'newest'>('oldest');
  const visibleComments = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return comments.filter((comment) => !needle || comment.body.toLocaleLowerCase().includes(needle) || comment.author.displayName.toLocaleLowerCase().includes(needle) || comment.mentionedUserIds.some((id) => members.find((member) => member.userId === id)?.displayName.toLocaleLowerCase().includes(needle))).sort((a, b) => order === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
  }, [comments, members, order, query]);
  async function editComment(comment: TaskComment) { const body = window.prompt('Edit your comment:', comment.body); if (body === null || !body.trim()) return; await edit(comment, body, comment.mentionedUserIds); }
  async function removeComment(comment: TaskComment) { if (window.confirm('Delete this comment?')) await remove(comment.id); }
  return <section className="task-collab-panel" aria-labelledby="task-discussion-title"><header><div><p className="workspace-eyebrow">KEEP EVERYONE IN THE LOOP</p><h2 id="task-discussion-title">Discussion <span>{comments.length}</span></h2></div></header>{error && <TaskDetailError message={error} />}{!loading && comments.length > 0 && <div className="task-comment-tools"><label><span className="sr-only">Search discussion</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search comments, authors, or mentions" /></label><label>Order<select value={order} onChange={(event) => setOrder(event.target.value as 'oldest' | 'newest')}><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label></div>}{loading ? <p className="productivity-message">Loading discussion…</p> : visibleComments.length === 0 && comments.length > 0 ? <div className="task-collab__empty"><strong>No comments match “{query}”</strong><p>Try another search or clear the field.</p><button type="button" onClick={() => setQuery('')}>Clear search</button></div> : <CommentList comments={visibleComments} currentUserId={currentUserId} members={members} onEdit={(comment) => void editComment(comment)} onRemove={(comment) => void removeComment(comment)} />}<CommentComposer members={members} busy={busy} onSubmit={add} /></section>;
}
