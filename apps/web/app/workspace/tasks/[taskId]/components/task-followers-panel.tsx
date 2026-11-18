'use client';

import { useTaskFollowers } from '../hooks/use-task-followers';
import type { WorkspaceMember } from '../types';
import { TaskDetailError } from './task-detail-error';

export function TaskFollowersPanel({ taskId, currentUserId, members }: { taskId: string; currentUserId: string; members: WorkspaceMember[] }) {
  const { followers, following, loading, busy, error, toggle } = useTaskFollowers(taskId, currentUserId);
  return <section className="task-followers-panel" aria-labelledby="task-followers-title"><header><div><p className="workspace-eyebrow">TASK UPDATES</p><h2 id="task-followers-title">Following <span>{followers.length}</span></h2></div><button type="button" disabled={busy} aria-pressed={following} onClick={() => void toggle()}>{following ? 'Unfollow task' : 'Follow task'}</button></header>{error && <TaskDetailError message={error} />}{loading ? <small>Loading followers…</small> : followers.length ? <div className="task-followers-panel__people">{followers.map((follower) => <span key={follower.id} title={follower.email}>{follower.displayName.trim().slice(0, 1).toLocaleUpperCase()}</span>)}</div> : <p>No one is following this task yet.</p>}<small>Followers receive Inbox updates when task details, prerequisites, discussion, or checklist items change. {members.length} people can join.</small></section>;
}
