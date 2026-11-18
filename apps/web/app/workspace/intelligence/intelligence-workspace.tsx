'use client';

import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { TaskLabels } from '../task-labels';

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
const prompts = ['What needs my attention?', 'What is happening this week?', 'Find the marketing project'];

export function IntelligenceWorkspace() {
  const { getToken } = useAuth();
  const { user, workspace } = useWorkspaceSession();
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

  useEffect(() => { void reload(); }, [reload]);

  async function ask(event?: FormEvent<HTMLFormElement>, suggested?: string) {
    event?.preventDefault();
    const query = (suggested ?? question).trim();
    if (!query) return;
    setQuestion(query); setAsking(true); setError(''); setResults([]);
    const normalized = query.toLocaleLowerCase();
    try {
      const data = briefing ?? await request(`/workspaces/${workspace.id}/intelligence/briefing`) as Briefing;
      if (!briefing) setBriefing(data);
      if (/\b(overdue|late|past due|attention|urgent)\b/.test(normalized)) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const items = data.focusTasks.filter((task) => task.dueAt && new Date(task.dueAt) < today && !['COMPLETED', 'CANCELLED'].includes(task.status));
        setAnswer(items.length ? `I found ${data.summary.overdueTasks} overdue ${data.summary.overdueTasks === 1 ? 'task' : 'tasks'} in this workspace. Here are the closest matches from your priority list.` : 'There are no overdue tasks in the current workspace briefing.');
        setResults(items.map((task) => ({ id: task.id, type: 'Overdue task', title: task.title, detail: `${task.projectName ? `${task.projectName} · ` : ''}${task.priority.toLocaleLowerCase()} priority · due ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(task.dueAt!))}`, href: `/workspace/tasks/${task.id}`, updatedAt: task.dueAt! })));
      } else if (/\b(week|calendar|schedule|happening|upcoming|deadline|deadlines)\b/.test(normalized)) {
        const items = [
          ...data.events.map((event) => ({ id: event.id, type: 'Calendar event', title: event.title, detail: new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(event.startsAt)), href: '/workspace/calendar', updatedAt: event.startsAt })),
          ...data.focusTasks.filter((task) => task.dueAt && new Date(task.dueAt) >= new Date()).map((task) => ({ id: task.id, type: 'Task deadline', title: task.title, detail: `${task.projectName ? `${task.projectName} · ` : ''}due ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(task.dueAt!))}`, href: `/workspace/tasks/${task.id}`, updatedAt: task.dueAt! })),
          ...data.upcomingProjects.map((project) => ({ id: project.id, type: 'Project deadline', title: project.name, detail: `Due ${project.dueAt ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(project.dueAt)) : 'soon'}`, href: '/workspace/projects', updatedAt: project.dueAt ?? '' })),
        ].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(0, 12);
        setAnswer(items.length ? `Here are the events and due dates I found for the next 7 days (${items.length} shown).` : 'There are no scheduled events or due dates in the next 7 days.');
        setResults(items);
      } else {
        const found = await request(`/workspaces/${workspace.id}/search?q=${encodeURIComponent(query)}`) as { results: SearchResult[] };
        setResults(found.results);
        setAnswer(found.results.length ? `I found ${found.results.length} workspace ${found.results.length === 1 ? 'item' : 'items'} matching “${query}”.` : `I couldn't find anything matching “${query}”. Try a project, task, document, or Knowledge item name.`);
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
      if (!planName.trim()) { setError('Add a project name before reviewing the plan.'); return; }
      if (!planTasks.length && !planMilestones.length) { setError('Add at least one task or milestone to the plan.'); return; }
      if (planTasks.length > 30 || planMilestones.length > 20) { setError('A plan can include up to 30 tasks and 20 milestones.'); return; }
      setReviewingPlan(true);
      return;
    }
    setSavingPlan(true);
    try {
      const created = await request(`/workspaces/${workspace.id}/intelligence/plans`, {
        method: 'POST', body: JSON.stringify({ name: planName, description: planGoal, dueAt: planDueAt || null, tasks: planTasks, milestones: planMilestones }),
      }) as { project: { id: string; name: string }; tasksCreated: number; milestonesCreated: number };
      setPlanNotice(`Created ${created.project.name} with ${created.tasksCreated} tasks and ${created.milestonesCreated} milestones.`);
      setPlanName(''); setPlanGoal(''); setPlanDueAt(''); setPlanTaskLines(''); setPlanMilestoneLines(''); setReviewingPlan(false);
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the project plan.'); }
    finally { setSavingPlan(false); }
  }

  const firstName = user.displayName.trim().split(/\s+/)[0] || 'there';
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return <div className="workspace-section-page intelligence-page">
    <header className="intelligence-hero">
      <p className="workspace-eyebrow">YOUR WORKSPACE · {workspace.name}</p>
      <h1>AVEN Intelligence</h1>
      <p>Bring your work into focus with a clear briefing and answers grounded in your workspace.</p>
      <span className="intelligence-hero__date">{today}</span>
    </header>
    {error && <p className="productivity-error" role="alert">{error}</p>}

    <section className="intelligence-ask" aria-labelledby="intelligence-ask-title">
      <div><span className="intelligence-spark" aria-hidden="true">✧</span><p className="workspace-eyebrow">WORKSPACE ASSISTANT</p><h2 id="intelligence-ask-title">Good day, {firstName}. What can I help you find?</h2><p>Answers use your saved AVEN workspace information.</p></div>
      <form onSubmit={(event) => void ask(event)}>
        <label className="sr-only" htmlFor="intelligence-question">Ask about your workspace</label>
        <input id="intelligence-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about your projects, tasks, or schedule…" maxLength={100} />
        <button type="submit" disabled={asking || question.trim().length < 2}>{asking ? 'Looking…' : 'Ask AVEN →'}</button>
      </form>
      <div className="intelligence-prompts">{prompts.map((prompt) => <button key={prompt} type="button" disabled={asking} onClick={() => void ask(undefined, prompt)}>{prompt}</button>)}</div>
      {answer && <div className="intelligence-answer" aria-live="polite"><p>{answer}</p>{results.length > 0 && <ul>{results.map((result) => <li key={`${result.type}-${result.id}`}><Link href={result.href}><span>{result.type}</span><strong>{result.title}</strong><small>{result.detail}</small></Link></li>)}</ul>}</div>}
    </section>

    {loading ? <div className="intelligence-loading" role="status">Gathering the latest workspace details…</div> : briefing && <>
      <section className="intelligence-stats" aria-label="Workspace at a glance">
        <article><span>Open tasks</span><strong>{briefing.summary.openTasks}</strong><small>Across the workspace</small></article>
        <article className={briefing.summary.overdueTasks ? 'has-alert' : ''}><span>Overdue</span><strong>{briefing.summary.overdueTasks}</strong><small>Need a review</small></article>
        <article><span>Due this week</span><strong>{briefing.summary.dueThisWeek}</strong><small>Tasks and projects</small></article>
        <article><span>Active projects</span><strong>{briefing.summary.activeProjects}</strong><small>In progress or planned</small></article>
      </section>

      <div className="intelligence-columns">
        <section className="intelligence-panel" aria-labelledby="intelligence-insights-title"><header><div><p className="workspace-eyebrow">BASED ON YOUR SAVED WORK</p><h2 id="intelligence-insights-title">A few things to notice</h2></div><button type="button" onClick={() => void reload()} disabled={loading}>↻ Refresh</button></header>
          <div className="intelligence-insights">{briefing.insights.map((insight) => <article className={`intelligence-insight is-${insight.tone}`} key={insight.id}><span aria-hidden="true">{insight.tone === 'urgent' ? '!' : insight.tone === 'warm' ? '◇' : '✓'}</span><div><h3>{insight.title}</h3><p>{insight.detail}</p><Link href={insight.href}>{insight.action} →</Link></div></article>)}</div>
          <small className="intelligence-footnote">Briefing refreshed {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(briefing.generatedAt))}. Suggestions are based on saved dates and statuses.</small>
        </section>
        <section className="intelligence-panel" aria-labelledby="intelligence-focus-title"><header><div><p className="workspace-eyebrow">A GOOD NEXT STEP</p><h2 id="intelligence-focus-title">Priority tasks</h2></div><Link href="/workspace/tasks">See all →</Link></header>
          {briefing.focusTasks.length ? <ol className="intelligence-task-list">{briefing.focusTasks.map((task) => <li key={task.id}><span className={`intelligence-priority is-${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span><div><Link href={`/workspace/tasks/${task.id}`}><strong>{task.title}</strong></Link><small>{task.projectName ?? 'Workspace task'}{task.dueAt ? ` · due ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(task.dueAt))}` : ' · no due date'}</small><TaskLabels labels={task.labels} compact /></div></li>)}</ol> : <div className="intelligence-blank"><strong>No open tasks yet</strong><p>Create tasks and AVEN will bring the next steps together here.</p><Link href="/workspace/tasks">Open tasks →</Link></div>}
        </section>
      </div>

      <div className="intelligence-columns">
        <section className="intelligence-panel" aria-labelledby="intelligence-calendar-title"><header><div><p className="workspace-eyebrow">NEXT 7 DAYS</p><h2 id="intelligence-calendar-title">On your calendar</h2></div><Link href="/workspace/calendar">Open calendar →</Link></header>
          {briefing.events.length ? <ul className="intelligence-event-list">{briefing.events.slice(0, 6).map((event) => <li key={event.id}><time>{new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(event.startsAt))}<strong>{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(event.startsAt))}</strong></time><div><strong>{event.title}</strong>{event.taskTitle && <small>Linked task · {event.taskTitle}</small>}</div></li>)}</ul> : <div className="intelligence-blank"><strong>Nothing scheduled this week</strong><p>Your new events will appear here.</p></div>}
        </section>
        <section className="intelligence-panel intelligence-panel--context" aria-labelledby="intelligence-context-title"><header><div><p className="workspace-eyebrow">YOUR WORKSPACE</p><h2 id="intelligence-context-title">Context AVEN can use</h2></div></header>
          <div className="intelligence-context-grid"><Link href="/workspace/projects"><strong>{briefing.summary.activeProjects}</strong><span>Projects</span></Link><Link href="/workspace/documents"><strong>{briefing.summary.documents}</strong><span>Documents</span></Link><Link href="/workspace/knowledge"><strong>{briefing.summary.knowledge}</strong><span>Knowledge items</span></Link><Link href="/workspace/databases"><strong>{briefing.summary.databases}</strong><span>Databases</span></Link><Link href="/workspace/calendar"><strong>{briefing.summary.eventsThisWeek}</strong><span>Events this week</span></Link></div>
          <p className="intelligence-privacy-note">AVEN searches only information in {workspace.name}. No external AI provider is connected in this version.</p>
        </section>
      </div>

      <section className="intelligence-plan-panel" aria-labelledby="intelligence-plan-title">
        <div className="intelligence-plan-panel__intro"><span aria-hidden="true">✧</span><div><p className="workspace-eyebrow">TURN AN IDEA INTO ACTION</p><h2 id="intelligence-plan-title">Build a project plan</h2><p>Write a goal and outline the steps. Review everything before AVEN creates the project, tasks, and milestones.</p></div></div>
        {planNotice && <p className="intelligence-plan-notice" role="status">{planNotice} <Link href="/workspace/projects">Open projects →</Link></p>}
        <form className="intelligence-plan-form" onSubmit={(event) => void submitPlan(event)}>
          <div className="intelligence-plan-form__fields">
            <label>Project name<input value={planName} onChange={(event) => setPlanName(event.target.value)} maxLength={160} required placeholder="Website redesign" /></label>
            <label>Target date <span>(optional)</span><input type="date" value={planDueAt} onChange={(event) => setPlanDueAt(event.target.value)} /></label>
            <label className="intelligence-plan-form__wide">Goal<textarea value={planGoal} onChange={(event) => setPlanGoal(event.target.value)} maxLength={5000} rows={2} placeholder="What outcome should this project deliver?" /></label>
            <label>Tasks <span>(one per line, up to 30)</span><textarea value={planTaskLines} onChange={(event) => setPlanTaskLines(event.target.value)} rows={5} placeholder={'Research current site\nCreate new wireframes\nReview and launch'} /></label>
            <label>Milestones <span>(one per line, up to 20)</span><textarea value={planMilestoneLines} onChange={(event) => setPlanMilestoneLines(event.target.value)} rows={5} placeholder={'Research complete\nDesign approved\nLaunch'} /></label>
          </div>
          {reviewingPlan && <div className="intelligence-plan-review"><p className="workspace-eyebrow">REVIEW BEFORE SAVING</p><strong>{planName}</strong>{planGoal && <p>{planGoal}</p>}<div><span>{planTasks.length} tasks</span><span>{planMilestones.length} milestones</span>{planDueAt && <span>Target {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${planDueAt}T12:00:00`))}</span>}</div><ul>{planTasks.map((task, index) => <li key={`${task}-${index}`}>{task}</li>)}</ul></div>}
          <div className="intelligence-plan-form__actions">{reviewingPlan && <button type="button" className="intelligence-plan-secondary" onClick={() => setReviewingPlan(false)}>Edit plan</button>}<button type="submit" disabled={savingPlan || loading || !planName.trim() || (!planTasks.length && !planMilestones.length)}>{savingPlan ? 'Creating…' : reviewingPlan ? 'Approve & create plan' : 'Review plan →'}</button></div>
        </form>
        <p className="intelligence-privacy-note">AVEN creates the project only after you approve this review. All records are saved together and attributed to you.</p>
      </section>
    </>}
  </div>;
}
