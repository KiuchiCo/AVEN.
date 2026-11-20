'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Icon } from './home-icons';
import { ago, greeting } from './relative-time';
import { useWorkspaceSession } from './workspace-shell';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

type Briefing = {
  summary: { openTasks: number; overdueTasks: number; dueThisWeek: number; activeProjects: number; eventsThisWeek: number };
  insights: { id: string; tone: string; title: string; detail: string; href: string }[];
  events: { id: string; title: string; startsAt: string; taskTitle: string | null }[];
};
type Summary = {
  hiddenWidgets: string[];
  unreadInbox: number;
  myTasks: { id: string; title: string; priority: string; status?: string; dueAt: string | null; projectName: string | null }[];
  projects: { id: string; name: string; status: string; dueAt: string | null; taskCount: number; completedTaskCount: number }[];
  recentDocuments: { id: string; title: string; updatedAt: string; projectName: string | null }[];
  recentActivity: { id: string; entityType: string; entityId: string; message: string; createdAt: string; actor: { displayName: string } }[];
};

const widgetLabels: Record<string, string> = { stats: 'Summary tiles', nextUp: 'Priority tasks', events: 'Today', insights: 'AI briefing', projects: 'Project progress', documents: 'Recent', activity: 'Recent activity' };
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const priorityLabel: Record<string, string> = { URGENT: 'Urgent', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

function activityLink(entityType: string, entityId: string) {
  if (entityType.startsWith('TASK')) return `/workspace/tasks/${entityId}`;
  if (entityType === 'DOCUMENT') return `/workspace/documents/${entityId}`;
  if (entityType === 'CHANNEL') return '/workspace/messages';
  return '/workspace/activity';
}
function dueLabel(dueAt: string | null, today: Date) {
  if (!dueAt) return 'No date';
  const due = new Date(`${dueAt.slice(0, 10)}T12:00:00`); const diff = Math.round((due.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime()) / 86_400_000);
  return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : diff < 0 ? `${-diff} days ago` : dayMonth.format(due);
}

export function HomeDashboard() {
  const { getToken } = useAuth();
  const router = useRouter();
  const { user, workspace } = useWorkspaceSession();
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [customising, setCustomising] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recentTab, setRecentTab] = useState<'ALL' | 'DOCUMENTS' | 'PROJECTS'>('ALL');
  const [ask, setAsk] = useState('');
  const firstName = user.displayName.trim().split(/\s+/)[0] || 'there';

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API. Check your local API setup.');
    const response = await fetch(`${apiBase}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message ?? 'AVEN could not complete that request.');
    return body;
  }, [getToken]);

  const load = useCallback(() => Promise.all([request(`/workspaces/${workspace.id}/intelligence/briefing`), request(`/workspaces/${workspace.id}/dashboard`)]), [request, workspace.id]);
  useEffect(() => {
    let cancelled = false;
    void load().then(([briefingData, summaryData]) => { if (!cancelled) { setBriefing(briefingData); setSummary(summaryData); setNow(new Date()); } })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load your dashboard.'); });
    return () => { cancelled = true; };
  }, [load]);

  async function toggleWidget(id: string, visible: boolean) {
    if (!summary) return;
    const hidden = visible ? summary.hiddenWidgets.filter((item) => item !== id) : [...summary.hiddenWidgets, id];
    setSaving(true); setError('');
    try { await request('/session/me', { method: 'PATCH', body: JSON.stringify({ dashboardHiddenWidgets: hidden }) }); setSummary({ ...summary, hiddenWidgets: hidden }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save your dashboard layout.'); }
    finally { setSaving(false); }
  }
  async function complete(taskId: string) {
    setError('');
    try { await request(`/workspaces/${workspace.id}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED' }) }); const [b, s] = await load(); setBriefing(b); setSummary(s); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not complete that task.'); }
  }
  function submitAsk(event: FormEvent) { event.preventDefault(); const text = ask.trim(); router.push(text ? `/workspace/intelligence?q=${encodeURIComponent(text)}` : '/workspace/intelligence'); }

  const shown = (id: string) => !summary?.hiddenWidgets.includes(id);
  const today = now ?? new Date();
  const todaysEvents = briefing ? briefing.events.filter((event) => sameDay(new Date(event.startsAt), today)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)) : [];
  const upcoming = briefing ? briefing.events.filter((event) => new Date(event.startsAt) > today && !sameDay(new Date(event.startsAt), today)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 3) : [];
  const insightText = briefing && briefing.insights.length ? briefing.insights.slice(0, 2).map((insight) => `${insight.title}. ${insight.detail}`).join(' ') : 'Nothing needs your attention right now.';
  const recents = summary ? [
    ...(recentTab !== 'PROJECTS' ? summary.recentDocuments.map((item) => ({ key: `d${item.id}`, kind: 'doc' as const, title: item.title, note: `Edited ${ago(item.updatedAt)}`, href: `/workspace/documents/${item.id}` })) : []),
    ...(recentTab !== 'DOCUMENTS' ? summary.projects.map((item) => ({ key: `p${item.id}`, kind: 'folder' as const, title: item.name, note: `${item.completedTaskCount} of ${item.taskCount} tasks done`, href: `/workspace/projects/${item.id}` })) : []),
  ].slice(0, 4) : [];
  const tiles = briefing ? [
    { icon: 'tasks' as const, label: 'Tasks', value: briefing.summary.openTasks, caption: briefing.summary.overdueTasks ? `Open · ${briefing.summary.overdueTasks} overdue` : 'Open', href: '/workspace/tasks', tone: 'green' },
    { icon: 'calendar' as const, label: 'Meetings', value: todaysEvents.length, caption: 'Today', href: '/workspace/calendar', tone: 'purple' },
    { icon: 'flag' as const, label: 'Deadlines', value: briefing.summary.dueThisWeek, caption: 'This week', href: '/workspace/inbox', tone: 'amber' },
    { icon: 'layers' as const, label: 'Projects', value: briefing.summary.activeProjects, caption: 'Active', href: '/workspace/projects', tone: 'blue' },
  ] : [];

  return (
    <section className="home" aria-label="Workspace dashboard">
      <div className="home__main">
        <header className="home-hero">
          <div>
            <p className="home-hero__date" suppressHydrationWarning>{longDate.format(today).toUpperCase()}</p>
            <h1>{now ? `${greeting(now.getHours())}, ${firstName}.` : `Welcome back, ${firstName}.`}</h1>
            <p className="home-hero__sub">Here’s your day at a glance.</p>
          </div>
          <button type="button" className="home-customise" aria-expanded={customising} onClick={() => setCustomising((open) => !open)} disabled={!summary}><Icon name="grid" size={18} />{customising ? 'Done' : 'Customise'}</button>
        </header>
        {customising && summary && <fieldset className="home-customise-panel" disabled={saving}>
          <legend>Show on your dashboard</legend>
          {Object.entries(widgetLabels).map(([id, label]) => <label key={id}><input type="checkbox" checked={shown(id)} onChange={(event) => void toggleWidget(id, event.target.checked)} />{label}</label>)}
        </fieldset>}
        {error && <p className="productivity-error" role="alert">{error}</p>}
        {!error && (!briefing || !summary) && <p className="productivity-message">Loading your workspace…</p>}

        {briefing && summary && <>
          {shown('stats') && <div className="home-tiles">{tiles.map((tile) => <Link key={tile.label} href={tile.href} className={`home-tile home-tile--${tile.tone}`}>
            <span className="home-tile__label"><Icon name={tile.icon} size={24} />{tile.label}</span>
            <span className="home-tile__value"><strong>{tile.value}</strong><small>{tile.caption}</small></span>
            <i aria-hidden="true" />
          </Link>)}</div>}

          {(shown('nextUp') || shown('events')) && <div className="home-row home-row--tasks">
            {shown('nextUp') && <article className="home-card"><header><h2>Priority tasks</h2><Link href="/workspace/tasks">See all <Icon name="arrow" size={14} /></Link></header>
              {summary.myTasks.length === 0 ? <p className="home-empty">Nothing assigned to you. Tasks assigned to you will appear here.</p> : <ul className="home-tasks">{summary.myTasks.slice(0, 5).map((task) => <li key={task.id}>
                <button type="button" className="home-check" aria-label={`Mark “${task.title}” complete`} onClick={() => void complete(task.id)} />
                <Link href={`/workspace/tasks/${task.id}`}>{task.title}</Link>
                <span className={`home-pill home-pill--${task.priority.toLowerCase()}`}>{priorityLabel[task.priority] ?? task.priority}</span>
                <span className="home-tasks__due">{dueLabel(task.dueAt, today)}</span>
              </li>)}</ul>}
            </article>}
            {shown('events') && <article className="home-card"><header><h2>Today</h2><Link href="/workspace/calendar" aria-label="Open the calendar"><Icon name="arrow" size={16} /></Link></header>
              {todaysEvents.length === 0 && upcoming.length === 0 ? <p className="home-empty">Nothing scheduled. Your day is clear.</p> : <ul className="home-events">
                {todaysEvents.map((event, index) => <li key={event.id}><time>{clock.format(new Date(event.startsAt))}</time><Link href="/workspace/calendar" className={`home-event home-event--${index % 3}`}>{event.title}</Link></li>)}
                {todaysEvents.length === 0 && <li className="home-events__note">Nothing today. Coming up:</li>}
                {todaysEvents.length === 0 && upcoming.map((event, index) => <li key={event.id}><time>{shortDate.format(new Date(event.startsAt))}</time><Link href="/workspace/calendar" className={`home-event home-event--${index % 3}`}>{event.title}</Link></li>)}
              </ul>}
            </article>}
          </div>}

          {(shown('insights') || shown('projects')) && <div className="home-row home-row--insight">
            {shown('insights') && <article className="home-card home-brief"><div className="home-brief__title"><Icon name="sparkle" size={28} /><h2>Your AI briefing</h2></div>
              <p>{insightText}</p>
              <div className="home-brief__actions"><Link className="home-button home-button--dark" href="/workspace/intelligence">View briefing <Icon name="arrow" size={16} /></Link><Link className="home-button" href="/workspace/analytics"><Icon name="target" size={16} />Show insights</Link></div>
            </article>}
            {shown('projects') && <article className="home-card"><header><h2>Project progress</h2><Link href="/workspace/projects">See all <Icon name="arrow" size={14} /></Link></header>
              {summary.projects.length === 0 ? <p className="home-empty">No active projects yet.</p> : <ul className="home-progress-list">{summary.projects.slice(0, 4).map((project) => { const percent = project.taskCount ? Math.round((project.completedTaskCount / project.taskCount) * 100) : 0; return <li key={project.id}>
                <Link href={`/workspace/projects/${project.id}`}>{project.name}</Link><span className="home-bar" role="img" aria-label={`${percent}% complete`}><i style={{ width: `${percent}%` }} /></span><b>{percent}%</b></li>; })}</ul>}
            </article>}
          </div>}

          {shown('documents') && <section className="home-recent"><header><h2>Recent</h2>
            <div role="tablist" aria-label="Recent items">{([['ALL', 'All'], ['DOCUMENTS', 'Documents'], ['PROJECTS', 'Projects']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={recentTab === id} onClick={() => setRecentTab(id)}>{label}</button>)}</div>
            <Link href="/workspace/documents">View all <Icon name="arrow" size={14} /></Link></header>
            {recents.length === 0 ? <p className="home-empty">Documents you write and projects you start will appear here.</p> : <div className="home-recent__cards">{recents.map((item) => <Link key={item.key} href={item.href} className="home-recent__card"><Icon name={item.kind} size={26} /><strong>{item.title}</strong><small>{item.note}</small></Link>)}</div>}
          </section>}

          {shown('activity') && <article className="home-card"><header><h2>Recent activity</h2><Link href="/workspace/activity">See all <Icon name="arrow" size={14} /></Link></header>
            {summary.recentActivity.length === 0 ? <p className="home-empty">Changes in this workspace will appear here.</p> : <ul className="home-activity">{summary.recentActivity.slice(0, 5).map((entry) => <li key={entry.id}><Link href={activityLink(entry.entityType, entry.entityId)}><strong>{entry.actor.displayName}</strong> {entry.message}</Link><small>{ago(entry.createdAt)}</small></li>)}</ul>}
          </article>}
        </>}
      </div>

      <aside className="home-ai" aria-label="AVEN Intelligence">
        <div className="home-ai__head"><Icon name="sparkle" size={26} /><h2>AVEN Intelligence</h2></div>
        <h3>Your intelligent workspace.</h3>
        <p>Plan, create, analyse and get things done across your entire workspace.</p>
        <ul>
          <li><Link href="/workspace/intelligence"><span><Icon name="sparkle" size={22} /></span><div><strong>Daily briefing</strong><small>A summary of your day</small></div></Link></li>
          <li><Link href="/workspace/search"><span><Icon name="search" size={22} /></span><div><strong>Find anything</strong><small>Search across all your workspace content</small></div></Link></li>
          <li><Link href="/workspace/intelligence"><span><Icon name="paper" size={22} /></span><div><strong>Take action</strong><small>Create, update and organise with AI</small></div></Link></li>
          <li><Link href="/workspace/intelligence?q=Help%20me%20focus%20on%20my%20most%20important%20task"><span><Icon name="target" size={22} /></span><div><strong>Deep work</strong><small>Get focused help on any task or project</small></div></Link></li>
        </ul>
        <form onSubmit={submitAsk}>
          <label className="visually-hidden" htmlFor="home-ask">Ask AVEN anything</label>
          <input id="home-ask" value={ask} maxLength={500} placeholder="Ask AVEN anything…" onChange={(event) => setAsk(event.target.value)} />
          <button aria-label="Ask" disabled={!ask.trim()}><Icon name="arrow" size={18} /></button>
        </form>
        <div className="home-ai__chips">{['Summarise my day', 'Plan my week', 'Project update'].map((chip) => <Link key={chip} href={`/workspace/intelligence?q=${encodeURIComponent(chip)}`}>{chip}</Link>)}</div>
      </aside>
    </section>
  );
}
