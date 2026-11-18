import type { ChecklistItem, TaskComment, TaskFollower } from '../types';
import { checklistProgress } from '../lib/checklist-progress';
export function TaskCollaborationStats({ comments, checklist, followers }: { comments: TaskComment[]; checklist: ChecklistItem[]; followers: TaskFollower[] }) {
  const progress = checklistProgress(checklist);
  return <section className="task-collaboration-stats" aria-label="Collaboration summary"><article><strong>{comments.length}</strong><span>Comments</span></article><article><strong>{progress.complete}/{progress.total}</strong><span>Checklist steps</span></article><article><strong>{followers.length}</strong><span>Following</span></article></section>;
}
