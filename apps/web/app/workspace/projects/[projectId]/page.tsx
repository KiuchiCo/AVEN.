'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useT } from '../../../i18n';
import { Icon } from '../../home-icons';
import { EmptyState, Panel, StatCard, StatRow } from '../../ui';
import { useProject } from '../project-context';
import { addDays, dateOnly, dayKey, isOpen, milestoneTimeline, taskStats, workload } from '../project-model';
import { PriorityPill, ProgressBar, formatDate } from '../project-ui';
import { WorkloadBars } from '../team/workload-bars';

/** How is this project progressing, and what needs attention? Everything here links to the tab that owns it. */
export default function OverviewTab() {
  const t = useT();
  const { project, tasks, milestones, team, activity, openTask } = useProject();
  const base = `/workspace/projects/${project.id}`;
  const stats = useMemo(() => taskStats(tasks), [tasks]);
  const today = dayKey(new Date());
  const horizon = dayKey(addDays(new Date(), 14));
  const attention = useMemo(() => tasks.filter((task) => isOpen(task) && task.dueAt && dateOnly(task.dueAt) <= horizon).sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? '')).slice(0, 6), [tasks, horizon]);
  const nextMilestones = milestoneTimeline(milestones).filter((row) => row.state !== 'DONE').slice(0, 4);
  const related = useMemo(() => {
    const ids = new Set([project.id, ...tasks.map((task) => task.id), ...milestones.map((milestone) => milestone.id)]);
    return activity.filter((entry) => ids.has(entry.entityId)).slice(0, 6);
  }, [activity, milestones, project.id, tasks]);
  const load = useMemo(() => workload(tasks, team, t('pj.unassigned')), [tasks, team, t]);
  const empty = tasks.length === 0 && milestones.length === 0;

  return <div className="pw-stack">
    <Panel className="pw-summary">
      <div className="pw-summary__text">
        {project.description ? <p className="pw-summary__desc">{project.description}</p> : <p className="pw-summary__desc pw-summary__desc--empty">{t('ph.noDesc')}</p>}
        <dl className="pw-facts">
          <div><dt>{t('pw.owner')}</dt><dd>{project.owner.displayName}</dd></div>
          <div><dt>{t('pj.startDate')}</dt><dd>{formatDate(project.startAt, t('ph.noDateSet'))}</dd></div>
          <div><dt>{t('ph.deadline')}</dt><dd>{formatDate(project.dueAt, t('ph.noDateSet'))}</dd></div>
        </dl>
      </div>
      <div className="pw-summary__progress"><span className="pw-summary__pct">{stats.progress}%</span><ProgressBar value={stats.progress} label={t('ph.taskProgress')} /><small>{t('ph.tasksDone', { done: stats.completed, total: stats.planned })}</small></div>
    </Panel>

    <StatRow columns={4} label={t('ph.summaryAria')}>
      <StatCard icon="tasks" value={stats.total} label={t('pw.totalTasks')} />
      <StatCard icon="checkCircle" tone="green" value={stats.completed} label={t('status.completed')} />
      <StatCard icon="refresh" tone="blue" value={stats.inProgress} label={t('status.inProgress')} />
      <StatCard icon="alert" tone="red" value={stats.overdue} label={t('pj.overdue')} />
    </StatRow>

    {empty && <EmptyState art="stack" title={t('pw.freshTitle')} text={t('pw.freshText')}><button type="button" className="rd-btn" onClick={() => openTask(null)}><Icon name="plus" size={18} />{t('pw.newTask')}</button><Link className="rd-btn rd-btn--soft" href={`${base}/milestones`}><Icon name="flag" size={18} />{t('pj.addMilestone')}</Link></EmptyState>}

    {!empty && <div className="pw-grid pw-grid--2">
      <Panel icon="clock" title={t('pw.needsAttention')} subtitle={t('pw.next14')} actions={<Link className="rd-btn rd-btn--soft rd-btn--small" href={`${base}/tasks`}>{t('pw.openTasks')}</Link>}>
        {attention.length === 0 ? <p className="pw-muted">{t('pw.nothingPressing')}</p> : <ul className="pw-rows">{attention.map((task) => <li key={task.id}>
          <button type="button" className="pw-rowlink" onClick={() => openTask(task)}><strong>{task.title}</strong><small className={dateOnly(task.dueAt) < today ? 'is-overdue' : ''}>{dateOnly(task.dueAt) < today ? `${t('pj.overdue')} · ` : ''}{t('tasks.due', { date: formatDate(task.dueAt, '') })}</small></button><PriorityPill priority={task.priority} /></li>)}</ul>}
      </Panel>
      <Panel icon="flag" title={t('pw.upcomingMilestones')} actions={<Link className="rd-btn rd-btn--soft rd-btn--small" href={`${base}/milestones`}>{t('pw.openMilestones')}</Link>}>
        {nextMilestones.length === 0 ? <p className="pw-muted">{milestones.length ? t('pw.allMilestonesDone') : t('pj.msNone')}</p> : <ul className="pw-rows">{nextMilestones.map(({ milestone, state }) => <li key={milestone.id}><span><strong>{milestone.title}</strong><small className={state === 'OVERDUE' ? 'is-overdue' : ''}>{milestone.dueAt ? formatDate(milestone.dueAt, '') : t('pj.noDate')}{state === 'OVERDUE' ? ` · ${t('pj.overdue')}` : ''}</small></span><span className="pw-rowprogress"><ProgressBar value={milestone.taskCount ? Math.round(milestone.completedCount / milestone.taskCount * 100) : 0} label={milestone.title} /><small>{milestone.completedCount}/{milestone.taskCount}</small></span></li>)}</ul>}
      </Panel>
      <Panel icon="users" title={t('pw.teamWorkload')} actions={<Link className="rd-btn rd-btn--soft rd-btn--small" href={`${base}/team`}>{t('pw.openTeam')}</Link>}>
        <WorkloadBars rows={load.filter((row) => row.assigned > 0 || row.userId !== null).slice(0, 6)} compact />
      </Panel>
      <Panel icon="history" title={t('home.recentActivity')}>
        {related.length === 0 ? <p className="pw-muted">{t('ph.noActivity')}</p> : <ol className="pw-activity">{related.map((entry) => <li key={entry.id}><p><strong>{entry.actor.displayName}</strong> {entry.message}</p><small>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))}</small></li>)}</ol>}
      </Panel>
    </div>}
  </div>;
}
