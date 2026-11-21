'use client';

import { useMemo, useState } from 'react';
import { useT } from '../../../../i18n';
import { Icon } from '../../../home-icons';
import { EmptyState, Panel, Pill, PillTabs } from '../../../ui';
import { GanttChart } from '../gantt-chart';
import { useProject } from '../../project-context';
import { milestoneTimeline, type Milestone } from '../../project-model';
import { MilestoneDialog } from '../../milestones/milestone-dialog';
import { ConfirmDialog, ProgressBar, formatDate, taskStatusKey } from '../../project-ui';

/** Every checkpoint on one chronological timeline, with the tasks that lead to it and how far along they are. */
export default function MilestonesTab() {
  const t = useT();
  const { project, milestones, tasks, request, reloadMilestones, openTask, busy, setBusy, fail, say, clear } = useProject();
  const [filter, setFilter] = useState<'UPCOMING' | 'DONE' | 'ALL'>('ALL');
  const [editing, setEditing] = useState<Milestone | 'new' | null>(null);
  const [removing, setRemoving] = useState<Milestone | null>(null);
  const timeline = useMemo(() => milestoneTimeline(milestones), [milestones]);
  const upcoming = timeline.filter((row) => row.state !== 'DONE').length;
  const done = timeline.length - upcoming;
  const shown = timeline.filter((row) => filter === 'ALL' || (filter === 'DONE') === (row.state === 'DONE'));
  const archived = project.status === 'ARCHIVED';

  async function toggle(milestone: Milestone) {
    setBusy(true); clear();
    try { await request(`/projects/${project.id}/milestones/${milestone.id}`, { method: 'PATCH', body: JSON.stringify({ completed: !milestone.completedAt }) }); await reloadMilestones(); }
    catch (reason) { fail(reason, 'Could not update this milestone.'); } finally { setBusy(false); }
  }
  async function remove(milestone: Milestone) {
    setBusy(true);
    try { await request(`/projects/${project.id}/milestones/${milestone.id}`, { method: 'DELETE' }); await reloadMilestones(); say(t('pw.milestoneRemoved', { title: milestone.title })); }
    catch (reason) { fail(reason, 'Could not remove this milestone.'); } finally { setBusy(false); setRemoving(null); }
  }

  return <div className="pw-stack">
    <div className="pw-toolbar">
      <PillTabs size="small" label={t('pw.milestoneFilter')} value={filter} onChange={setFilter} items={[{ key: 'ALL', label: t('pw.all'), count: timeline.length }, { key: 'UPCOMING', label: t('pw.upcoming'), count: upcoming }, { key: 'DONE', label: t('status.completed'), count: done }]} />
      <span className="pw-spacer" />
      <button type="button" className="rd-btn" onClick={() => setEditing('new')} disabled={archived}><Icon name="plus" size={18} />{t('pj.addMilestone')}</button>
    </div>

    {timeline.length === 0 ? <EmptyState art="folder" title={t('pw.noMilestonesTitle')} text={t('pj.msNone')}><button type="button" className="rd-btn" onClick={() => setEditing('new')} disabled={archived}><Icon name="plus" size={18} />{t('pj.addMilestone')}</button></EmptyState>
      : shown.length === 0 ? <p className="pw-muted">{t('pw.noneInFilter')}</p>
        : <ol className="pw-timeline">{shown.map(({ milestone, state }) => {
          const progress = milestone.taskCount ? Math.round(milestone.completedCount / milestone.taskCount * 100) : state === 'DONE' ? 100 : 0;
          return <li key={milestone.id} className={`pw-timeline__item st-${state.toLowerCase()}`}>
            <span className="pw-timeline__dot" aria-hidden="true" />
            <article className="pw-milestone">
              <header>
                <label className="pw-check" title={milestone.completedAt ? t('pw.reopen') : t('pw.markDone')}><input type="checkbox" checked={Boolean(milestone.completedAt)} disabled={busy || archived} aria-label={`${milestone.completedAt ? t('pw.reopen') : t('pw.markDone')}: ${milestone.title}`} onChange={() => void toggle(milestone)} /></label>
                <div className="pw-milestone__title"><h3>{milestone.title}</h3><p className={state === 'OVERDUE' ? 'is-overdue' : ''}><Icon name="calendar" size={14} />{milestone.dueAt ? formatDate(milestone.dueAt, '') : t('pj.noDate')}{state === 'OVERDUE' ? ` · ${t('pj.overdue')}` : ''}</p></div>
                <Pill tone={state === 'DONE' ? 'green' : state === 'OVERDUE' ? 'red' : 'blue'}>{state === 'DONE' ? t('status.completed') : state === 'OVERDUE' ? t('pj.overdue') : t('pw.upcoming')}</Pill>
                <button type="button" className="rd-iconbtn" aria-label={t('pw.editNamed', { title: milestone.title })} onClick={() => setEditing(milestone)} disabled={archived}><Icon name="edit" size={16} /></button>
                <button type="button" className="rd-iconbtn" aria-label={t('ph.removeAria', { name: milestone.title })} onClick={() => setRemoving(milestone)} disabled={archived}><Icon name="trash" size={16} /></button>
              </header>
              {milestone.description && <p className="pw-milestone__desc">{milestone.description}</p>}
              <div className="pw-milestone__progress"><ProgressBar value={progress} label={t('pw.progressOf', { name: milestone.title })} /><small>{t('ph.tasksDone', { done: milestone.completedCount, total: milestone.taskCount })}</small></div>
              <details className="pw-more"><summary>{t('pw.relatedTasks', { n: milestone.tasks.length })}</summary>
                {milestone.tasks.length === 0 ? <p className="pw-muted">{t('pw.noRelatedTasks')}</p> : <ul className="pw-rows">{milestone.tasks.map((task) => { const full = tasks.find((row) => row.id === task.id); return <li key={task.id}><button type="button" className="pw-rowlink" onClick={() => full && openTask(full)}><strong>{task.title}</strong><small>{t(taskStatusKey[task.status] ?? 'status.todo')}{task.dueAt ? ` · ${t('tasks.due', { date: formatDate(task.dueAt, '') })}` : ''}</small></button></li>; })}</ul>}
                <button type="button" className="rd-btn rd-btn--soft rd-btn--small" disabled={archived} onClick={() => openTask(null, { milestoneId: milestone.id })}><Icon name="plus" size={16} />{t('pw.addTaskHere')}</button>
              </details>
            </article>
          </li>;
        })}</ol>}

    <Panel icon="trend" title={t('ph.timeline')} subtitle={t('ph.scheduled', { n: tasks.filter((task) => task.dueAt).length })}>
      {tasks.some((task) => task.dueAt) ? <GanttChart tasks={tasks.filter((task) => task.status !== 'CANCELLED')} /> : <p className="pw-muted">{t('ph.timelineEmpty')}</p>}
    </Panel>

    {editing && <MilestoneDialog milestone={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    {removing && <ConfirmDialog title={t('pw.removeMilestoneTitle')} confirmLabel={t('ph.remove')} busy={busy} onConfirm={() => void remove(removing)} onClose={() => setRemoving(null)}>{t('pw.removeMilestoneBody', { title: removing.title })}</ConfirmDialog>}
  </div>;
}
