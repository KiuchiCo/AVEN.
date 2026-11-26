import { useT } from '../../../../i18n';
import { CommentCard } from './comment-card';
import type { TaskComment, WorkspaceMember } from '../types';

export function CommentList({ comments, currentUserId, members, disabled, onEdit, onRemove }: { comments: TaskComment[]; currentUserId: string; members: WorkspaceMember[]; disabled: boolean; onEdit: (comment: TaskComment, body: string, mentions: string[]) => Promise<boolean>; onRemove: (comment: TaskComment) => void }) {
  const t = useT();
  if (!comments.length) return <div className="task-collab__empty"><strong>{t('td.startDiscussion')}</strong><p>{t('td.startDiscussionText')}</p></div>;
  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]));
  return <div className="task-comment-list">{comments.map((comment) => <CommentCard key={comment.id} comment={comment} canEdit={comment.author.id === currentUserId} disabled={disabled} members={members} mentionNames={comment.mentionedUserIds.map((id) => memberNames.get(id) ?? t('td.member'))} onEdit={onEdit} onRemove={onRemove} />)}</div>;
}
