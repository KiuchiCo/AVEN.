'use client';

import { useT } from '../../../../i18n';
import { useTaskFollowers } from '../hooks/use-task-followers';
import type { WorkspaceMember } from '../types';
import { TaskDetailError } from './task-detail-error';

export function TaskFollowersPanel({ taskId, currentUserId, members }: { taskId: string; currentUserId: string; members: WorkspaceMember[] }) {
  const t = useT();
  const { followers, following, loading, busy, error, toggle } = useTaskFollowers(taskId, currentUserId);
  return <section className="task-followers-panel" aria-labelledby="task-followers-title"><header><div><p className="workspace-eyebrow">{t('td.taskUpdates')}</p><h2 id="task-followers-title">{t('td.following')} <span>{followers.length}</span></h2></div><button type="button" disabled={busy} aria-pressed={following} onClick={() => void toggle()}>{following ? t('td.unfollow') : t('td.follow')}</button></header>{error && <TaskDetailError message={error} />}{loading ? <small>{t('td.loadingFollowers')}</small> : followers.length ? <div className="task-followers-panel__people">{followers.map((follower) => <span key={follower.id} title={follower.email}>{follower.displayName.trim().slice(0, 1).toLocaleUpperCase()}</span>)}</div> : <p>{t('td.noFollowers')}</p>}<small>{t('td.followersNote', { n: members.length })}</small></section>;
}
