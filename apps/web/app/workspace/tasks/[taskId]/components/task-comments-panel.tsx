'use client';

import { useT } from '../../../../i18n';
import { useEffect, useMemo, useState } from 'react';
import { useTaskComments } from '../hooks/use-task-comments';
import type { TaskComment, WorkspaceMember } from '../types';
import { CommentComposer } from './comment-composer';
import { CommentList } from './comment-list';
import { TaskDetailError } from './task-detail-error';

export function TaskCommentsPanel({ taskId, currentUserId, members }: { taskId: string; currentUserId: string; members: WorkspaceMember[] }) {
  const t = useT();
  const { comments, loading, busy, error, add, edit, remove } = useTaskComments(taskId);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<'oldest' | 'newest'>('oldest');
  const [scope, setScope] = useState<'all' | 'mine' | 'mentioned'>('all');
  const visibleComments = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return comments.filter((comment) => {
      const inScope = scope === 'all' || (scope === 'mine' ? comment.author.id === currentUserId : comment.mentionedUserIds.includes(currentUserId));
      const matchesSearch = !needle || comment.body.toLocaleLowerCase().includes(needle) || comment.author.displayName.toLocaleLowerCase().includes(needle) || comment.mentionedUserIds.some((id) => members.find((member) => member.userId === id)?.displayName.toLocaleLowerCase().includes(needle));
      return inScope && matchesSearch;
    }).sort((a, b) => order === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
  }, [comments, currentUserId, members, order, query, scope]);
  useEffect(() => {
    if (loading || !window.location.hash.startsWith('#task-comment-')) return;
    const targetId = decodeURIComponent(window.location.hash.slice(1));
    const frame = window.requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    return () => window.cancelAnimationFrame(frame);
  }, [comments, loading]);
  async function removeComment(comment: TaskComment) { if (window.confirm(t('td.deleteCommentConfirm'))) await remove(comment.id); }
  const filterLabel = t(scope === 'mine' ? 'td.scope.mine' : scope === 'mentioned' ? 'td.scope.mentioned' : 'td.scope.all');
  return <section className="task-collab-panel" aria-labelledby="task-discussion-title"><header><div><p className="workspace-eyebrow">{t('td.inLoop')}</p><h2 id="task-discussion-title">{t('td.tab.discussion')} <span>{comments.length}</span></h2></div></header>{error && <TaskDetailError message={error} />}{!loading && comments.length > 0 && <div className="task-comment-tools"><label><span className="visually-hidden">{t('td.searchDiscussion')}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('td.searchPh')} /></label><label>{t('td.show')}<select value={scope} onChange={(event) => setScope(event.target.value as 'all' | 'mine' | 'mentioned')}><option value="all">{t('td.allComments')}</option><option value="mine">{t('td.mine')}</option><option value="mentioned">{t('td.mentioningMe')}</option></select></label><label>{t('td.order')}<select value={order} onChange={(event) => setOrder(event.target.value as 'oldest' | 'newest')}><option value="oldest">{t('td.oldest')}</option><option value="newest">{t('td.newest')}</option></select></label></div>}{loading ? <p className="productivity-message">{t('td.loadingDiscussion')}</p> : visibleComments.length === 0 && comments.length > 0 ? <div className="task-collab__empty"><strong>{query ? t('td.noneFoundFor', { what: filterLabel, query }) : t('td.noneFound', { what: filterLabel })}</strong><p>{t('td.tryOther')}</p><button type="button" onClick={() => { setQuery(''); setScope('all'); }}>{t('td.clearFilters')}</button></div> : <CommentList comments={visibleComments} currentUserId={currentUserId} members={members} disabled={busy} onEdit={edit} onRemove={(comment) => void removeComment(comment)} />}<CommentComposer members={members} busy={busy} onSubmit={add} /></section>;
}
