export function TaskDiscussionCount({ comments, checklist }: { comments: number; checklist: number }) {
  return <div className="task-discussion-count" aria-label={`${comments} comments and ${checklist} checklist items`}><span>{comments} {comments === 1 ? 'comment' : 'comments'}</span><i aria-hidden="true">·</i><span>{checklist} checklist {checklist === 1 ? 'item' : 'items'}</span></div>;
}
