'use client';

import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import { useWorkspaceSession } from '../workspace-shell';
import { TaskLabels } from '../task-labels';
import { AssistantChat } from './assistant-chat';
import { PageHeader } from '../ui';

type Briefing = {
  generatedAt: string;
  summary: { openTasks: number; overdueTasks: number; dueThisWeek: number; activeProjects: number; eventsThisWeek: number; documents: number; databases: number; knowledge: number };
  insights: Array<{ id: string; tone: string; title: string; detail: string; href: string; action: string }>;
  focusTasks: Array<{ id: string; title: string; status: string; priority: string; labels: string[]; dueAt: string | null; projectName: string | null }>;
  events: Array<{ id: string; title: string; startsAt: string; endsAt: string | null; taskTitle: string | null }>;
  upcomingProjects: Array<{ id: string; name: string; status: string; dueAt: string | null }>;
};
type SearchResult = { id: string; type: string; title: string; detail: string; href: string; updatedAt: string };

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

export function IntelligenceWorkspace() {
  const { getToken } = useAuth();
  const t = useT();
  const prompts = [t('in.p1'), t('in.p2'), t('in.p3')];
  const { workspace } = useWorkspaceSession();
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const [planName, setPlanName] = useState('');
  const [planGoal, setPlanGoal] = useState('');
  const [planDueAt, setPlanDueAt] = useState('');
  const [planTaskLines, setPlanTaskLines] = useState('');
  const [planMilestoneLines, setPlanMilestoneLines] = useState('');
  const [reviewingPlan, setReviewingPlan] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planNotice, setPlanNotice] = useState('');

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to its API. Check your local API setup.');
    const response = await fetch(`${apiBase}${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...options.headers } });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(body?.message ?? 'AVEN could not load this workspace information.');
    }
    return response.json();
  }, [getToken]);

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setBriefing(await request(`/workspaces/${workspace.id}/intelligence/briefing`) as Briefing); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load your briefing.'); }
    finally { setLoading(false); }
  }, [request, workspace.id]);

  useEffect(() => {
    let live = true;
    async function load() {
      try { const next = await request(`/workspaces/${workspace.id}/intelligence/briefing`) as Briefing; if (live) setBriefing(next); }
      catch (reason) { if (live) setError(reason instanceof Error ? reason.message : 'Could not load your briefing.'); }
      finally { if (live) setLoading(false); }
    }
    void load();
    return () => { live = false; };
  }, [request, workspace.id]);

  async function ask(event?: FormEvent<HTMLFormElement>, suggested?: string) {
    event?.preventDefault();
    const query = (suggested ?? question).trim();
    if (!query) return;
    setQuestion(query); setAsking(true); setError(''); setResults([]);
    const normalized = query.toLocaleLowerCase();
    try {
      const data = briefing ?? await request(`/workspaces/${workspace.id}/intelligence/briefing`) as Briefing;
      if (!briefing) setBriefing(data);
      if (/\b(overdue|late|past due|attention|urgent|vencid[ao]s?|atrasad[ao]s?|urgente|retard|urgent|überfällig|dringend|aufmerksamkeit)\b/i.test(normalized)) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const items = data.focusTasks.filter((task) => task.dueAt && new Date(task.dueAt) < today && !['COMPLETED', 'CANCELLED'].includes(task.status));
        setAnswer(items.length ? (data.summary.overdueTasks === 1 ? t('in.overdueFoundOne') : t('in.overdueFound', { n: data.summary.overdueTasks })) : t('in.noOverdue'));
        setResults(items.map((task) => ({ id: task.id, type: t('in.t.overdue'), title: task.title, detail: t('in.priorityDue', { project: task.projectName ? `${task.projectName} · ` : '', priority: t(`prio.${task.priority.toLowerCase()}` as 'prio.low'), date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(task.dueAt!)) }), href: `/workspace/tasks/${task.id}`, updatedAt: task.dueAt! })));
      } else if (/\b(week|calendar|schedule|happening|upcoming|deadline|deadlines|semana|calendario|agenda|próxim[oa]s?|plazos?|semaine|calendrier|échéances?|woche|kalender|termine|fristen)\b/i.test(normalized)) {
        const items = [
          ...data.events.map((event) => ({ id: event.id, type: t('in.t.event'), title: event.title, detail: new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(event.startsAt)), href: '/workspace/calendar', updatedAt: event.startsAt })),
          ...data.focusTasks.filter((task) => task.dueAt && new Date(task.dueAt) >= new Date()).map((task) => ({ id: task.id, type: t('in.t.deadline'), title: task.title, detail: t('in.dueShort', { project: task.projectName ? `${task.projectName} · ` : '', date: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(task.dueAt!)) }), href: `/workspace/tasks/${task.id}`, updatedAt: task.dueAt! })),
          ...data.upcomingProjects.map((project) => ({ id: project.id, type: t('in.t.projectDeadline'), title: project.name, detail: t('in.projectDue', { date: project.dueAt ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(project.dueAt)) : t('in.soon') }), href: '/workspace/projects', updatedAt: project.dueAt ?? '' })),
        ].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(0, 12);
        setAnswer(items.length ? t('in.weekFound', { n: items.length }) : t('in.weekNone'));
        setResults(items);
      } else {
        const found = await request(`/workspaces/${workspace.id}/search?q=${encodeURIComponent(query)}`) as { results: SearchResult[] };
        setResults(found.results);
        setAnswer(found.results.length ? (found.results.length === 1 ? t('in.itemFoundOne', { q: query }) : t('in.itemsFound', { n: found.results.length, q: query })) : t('in.nothingFound', { q: query }));
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not answer from this workspace.'); }
    finally { setAsking(false); }
  }

  const planTasks = planTaskLines.split('\n').map((item) => item.trim()).filter(Boolean);
  const planMilestones = planMilestoneLines.split('\n').map((item) => item.trim()).filter(Boolean);

  async function submitPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPlanNotice(''); setError('');
    if (!reviewingPlan) {
      if (!planName.trim()) { setError(t('in.planNeedName')); return; }
      if (!planTasks.length && !planMilestones.length) { setError(t('in.planNeedItems')); return; }
      if (planTasks.length > 30 || planMilestones.length > 20) { setError(t('in.planLimits')); return; }
      setReviewingPlan(true);
      return;
    }
    setSavingPlan(true);
    try {
      const created = await request(`/workspaces/${workspace.id}/intelligence/plans`, {
        method: 'POST', body: JSON.stringify({ name: planName, description: planGoal, dueAt: planDueAt || null, tasks: planTasks, milestones: planMilestones }),
      }) as { project: { id: string; name: string }; tasksCreated: number; milestonesCreated: number };
      setPlanNotice(t('in.planCreated', { name: created.project.name, tasks: created.tasksCreated, milestones: created.milestonesCreated }));
      setPlanName(''); setPlanGoal(''); setPlanDueAt(''); setPlanTaskLines(''); setPlanMilestoneLines(''); setReviewingPlan(false);
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the project plan.'); }
    finally { setSavingPlan(false); }
  }

  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return <div className="workspace-section-page intelligence-page">
    <header className="intelligence-hero">
      <PageHeader eyebrow={t('act.eyebrow', { name: workspace.name })} title={t('in.title')} description={t('in.heroDesc')} icon="sparkle" />
      <span className="intelligence-hero__date">{today}</span>
    </header>
    <AssistantChat />
    {error && <p className="productivity-error" role="alert">{error}</p>}

    <section className="intelligence-ask" aria-labelledby="intelligence-ask-title">
      <div><span className="intelligence-spark" aria-hidden="true">✧</span><p className="workspace-eyebrow">{t('in.quickSearch')}</p><h2 id="intelligence-ask-title">{t('in.findTitle')}</h2><p>{t('in.findHint')}</p></div>
      <form onSubmit={(event) => void ask(event)}>
        <label className="sr-only" htmlFor="intelligence-question">{t('in.askLabel')}</label>
        <input id="intelligence-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t('in.askPh')} maxLength={100} />
        <button type="submit" disabled={asking || question.trim().length < 2}>{asking ? t('in.looking') : t('in.search')}</button>
      </form>
      <div className="intelligence-prompts">{prompts.map((prompt) => <button key={prompt} type="button" disabled={asking} onClick={() => void ask(undefined, prompt)}>{prompt}</button>)}</div>
      {answer && <div className="intelligence-answer" aria-live="polite"><p>{answer}</p>{results.length > 0 && <ul>{results.map((result) => <li key={`${result.type}-${result.id}`}><Link href={result.href}><span>{result.type}</span><strong>{result.title}</strong><small>{result.detail}</small></Link></li>)}</ul>}</div>}
    </section>

    {loading ? <div className="intelligence-loading" role="status">{t('in.loadingBrief')}</div> : briefing && <>
      <section className="intelligence-stats" aria-label={t('in.glance')}>
        <article><span>{t('in.openTasks')}</span><strong>{briefing.summary.openTasks}</strong><small>{t('in.acrossWs')}</small></article>
        <article className={briefing.summary.overdueTasks ? 'has-alert' : ''}><span>{t('in.overdue')}</span><strong>{briefing.summary.overdueTasks}</strong><small>{t('in.needReview')}</small></article>
        <article><span>{t('in.dueWeek')}</span><strong>{briefing.summary.dueThisWeek}</strong><small>{t('in.tasksAndProjects')}</small></article>
        <article><span>{t('in.activeProjects')}</span><strong>{briefing.summary.activeProjects}</strong><small>{t('in.inProgressOrPlanned')}</small></article>
      </section>

      <div className="intelligence-columns">
        <section className="intelligence-panel" aria-labelledby="intelligence-insights-title"><header><div><p className="workspace-eyebrow">{t('in.basedOn')}</p><h2 id="intelligence-insights-title">{t('in.notice')}</h2></div><button type="button" onClick={() => void reload()} disabled={loading}>{t('in.refresh')}</button></header>
          <div className="intelligence-insights">{briefing.insights.map((insight) => <article className={`intelligence-insight is-${insight.tone}`} key={insight.id}><span aria-hidden="true">{insight.tone === 'urgent' ? '!' : insight.tone === 'warm' ? '◇' : '✓'}</span><div><h3>{insight.title}</h3><p>{insight.detail}</p><Link href={insight.href}>{insight.action} →</Link></div></article>)}</div>
          <small className="intelligence-footnote">{t('in.footnote', { time: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(briefing.generatedAt)) })}</small>
        </section>
        <section className="intelligence-panel" aria-labelledby="intelligence-focus-title"><header><div><p className="workspace-eyebrow">{t('in.nextStep')}</p><h2 id="intelligence-focus-title">{t('in.priorityTasks')}</h2></div><Link href="/workspace/tasks">{t('in.seeAll')}</Link></header>
          {briefing.focusTasks.length ? <ol className="intelligence-task-list">{briefing.focusTasks.map((task) => <li key={task.id}><span className={`intelligence-priority is-${task.priority.toLowerCase()}`}>{t(`prio.${task.priority.toLowerCase()}` as 'prio.low')}</span><div><Link href={`/workspace/tasks/${task.id}`}><strong>{task.title}</strong></Link><small>{task.projectName ?? t('in.wsTask')}{task.dueAt ? t('in.dueOn', { date: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(task.dueAt)) }) : t('in.noDue')}</small><TaskLabels labels={task.labels} compact /></div></li>)}</ol> : <div className="intelligence-blank"><strong>{t('in.noOpen')}</strong><p>{t('in.noOpenHint')}</p><Link href="/workspace/tasks">{t('in.openTasksLink')}</Link></div>}
        </section>
      </div>

      <div className="intelligence-columns">
        <section className="intelligence-panel" aria-labelledby="intelligence-calendar-title"><header><div><p className="workspace-eyebrow">{t('in.next7')}</p><h2 id="intelligence-calendar-title">{t('in.onCalendar')}</h2></div><Link href="/workspace/calendar">{t('in.openCalendar')}</Link></header>
          {briefing.events.length ? <ul className="intelligence-event-list">{briefing.events.slice(0, 6).map((event) => <li key={event.id}><time>{new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(event.startsAt))}<strong>{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(event.startsAt))}</strong></time><div><strong>{event.title}</strong>{event.taskTitle && <small>{t('in.linkedTask', { name: event.taskTitle })}</small>}</div></li>)}</ul> : <div className="intelligence-blank"><strong>{t('in.nothingWeek')}</strong><p>{t('in.eventsAppear')}</p></div>}
        </section>
        <section className="intelligence-panel intelligence-panel--context" aria-labelledby="intelligence-context-title"><header><div><p className="workspace-eyebrow">{t('in.yourWs')}</p><h2 id="intelligence-context-title">{t('in.context')}</h2></div></header>
          <div className="intelligence-context-grid"><Link href="/workspace/projects"><strong>{briefing.summary.activeProjects}</strong><span>{t('nav.projects')}</span></Link><Link href="/workspace/documents"><strong>{briefing.summary.documents}</strong><span>{t('nav.documents')}</span></Link><Link href="/workspace/knowledge"><strong>{briefing.summary.knowledge}</strong><span>{t('in.knowledgeItems')}</span></Link><Link href="/workspace/databases"><strong>{briefing.summary.databases}</strong><span>{t('nav.databases')}</span></Link><Link href="/workspace/calendar"><strong>{briefing.summary.eventsThisWeek}</strong><span>{t('in.eventsWeek')}</span></Link></div>
          <p className="intelligence-privacy-note">{t('in.privacy', { name: workspace.name })}</p>
        </section>
      </div>

      <section className="intelligence-plan-panel" aria-labelledby="intelligence-plan-title">
        <div className="intelligence-plan-panel__intro"><span aria-hidden="true">✧</span><div><p className="workspace-eyebrow">{t('in.planEyebrow')}</p><h2 id="intelligence-plan-title">{t('in.planTitle')}</h2><p>{t('in.planIntro')}</p></div></div>
        {planNotice && <p className="intelligence-plan-notice" role="status">{planNotice} <Link href="/workspace/projects">{t('in.openProjects')}</Link></p>}
        <form className="intelligence-plan-form" onSubmit={(event) => void submitPlan(event)}>
          <div className="intelligence-plan-form__fields">
            <label>{t('in.projectName')}<input value={planName} onChange={(event) => setPlanName(event.target.value)} maxLength={160} required placeholder={t('in.projectNamePh')} /></label>
            <label>{t('in.targetDate')} <span>{t('doc.optional')}</span><input type="date" value={planDueAt} onChange={(event) => setPlanDueAt(event.target.value)} /></label>
            <label className="intelligence-plan-form__wide">{t('in.goal')}<textarea value={planGoal} onChange={(event) => setPlanGoal(event.target.value)} maxLength={5000} rows={2} placeholder={t('in.goalPh')} /></label>
            <label>{t('in.tasks')} <span>{t('in.tasksHint')}</span><textarea value={planTaskLines} onChange={(event) => setPlanTaskLines(event.target.value)} rows={5} placeholder={t('in.tasksPh')} /></label>
            <label>{t('in.milestones')} <span>{t('in.milestonesHint')}</span><textarea value={planMilestoneLines} onChange={(event) => setPlanMilestoneLines(event.target.value)} rows={5} placeholder={t('in.milestonesPh')} /></label>
          </div>
          {reviewingPlan && <div className="intelligence-plan-review"><p className="workspace-eyebrow">{t('in.reviewBefore')}</p><strong>{planName}</strong>{planGoal && <p>{planGoal}</p>}<div><span>{t('in.nTasks', { n: planTasks.length })}</span><span>{t('in.nMilestones', { n: planMilestones.length })}</span>{planDueAt && <span>{t('in.target', { date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${planDueAt}T12:00:00`)) })}</span>}</div><ul>{planTasks.map((task, index) => <li key={`${task}-${index}`}>{task}</li>)}</ul></div>}
          <div className="intelligence-plan-form__actions">{reviewingPlan && <button type="button" className="intelligence-plan-secondary" onClick={() => setReviewingPlan(false)}>{t('in.editPlan')}</button>}<button type="submit" disabled={savingPlan || loading || !planName.trim() || (!planTasks.length && !planMilestones.length)}>{savingPlan ? t('in.creating') : reviewingPlan ? t('in.approve') : t('in.reviewPlan')}</button></div>
        </form>
        <p className="intelligence-privacy-note">{t('in.planPrivacy')}</p>
      </section>
    </>}
  </div>;
}
