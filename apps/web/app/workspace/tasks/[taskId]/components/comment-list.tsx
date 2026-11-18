import { CommentCard } from './comment-card';
import type { TaskComment, WorkspaceMember } from '../types';

export function CommentList({ comments, currentUserId, members, onEdit, onRemove }: { comments: TaskComment[]; currentUserId: string; members: WorkspaceMember[]; onEdit: (comment: TaskComment) => void; onRemove: (comment: TaskComment) => void }) {
  if (!comments.length) return <div className="task-collab__empty"><span aria-hidden="true">✧</span><strong>Start the task discussion</strong><p>Share decisions, progress, and questions with everyone on this task.</p></div>;
  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]));
  return <div className="task-comment-list">{comments.map((comment) => <CommentCard key={comment.id} comment={comment} canEdit={comment.author.id === currentUserId} mentionNames={comment.mentionedUserIds.map((id) => memberNames.get(id) ?? 'Workspace member')} onEdit={onEdit} onRemove={onRemove} />)}</div>;
}
