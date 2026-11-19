'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
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
  myTasks: { id: string; title: string; priority: string; dueAt: string | null; projectName: string | null }[];
  projects: { id: string; name: string; status: string; dueAt: string | null; taskCount: number; completedTaskCount: number }[];
  recentDocuments: { id: string; title: string; updatedAt: string; projectName: string | null }[];
  recentActivity: { id: string; entityType: string; entityId: string; message: string; createdAt: string; actor: { displayName: string } }[];
};

const widgetLabels: Record<string, string> = {
  stats: 'Summary', nextUp: 'My next tasks', projects: 'Project progress', events: 'Upcoming events',
  documents: 'Recent documents', activity: 'Recent activity', insights: 'Workspace insights',
};
const quickActions = [
  { label: 'Start a project', href: '/workspace/projects' },
  { label: 'Write a document', href: '/workspace/documents' },
  { label: 'Schedule an event', href: '/workspace/calendar' },
  { label: 'Search the workspace', href: '/workspace/search' },
  { label: 'Ask AVEN Intelligence', href: '/workspace/intelligence' },
];

const dateOnly = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const dateTime = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function activityLink(entityType: string, entityId: string) {
  if (entityType.startsWith('TASK')) return `/workspace/tasks/${entityId}`;
  if (entityType === 'DOCUMENT') return `/workspace/documents/${entityId}`;
  return '/workspace/activity';
}

export function HomeDashboard() {
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [customising, setCustomising] = useState(false);
  const [saving, setSaving] = useState(false);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API. Check your local API setup.');
    const response = await fetch(`${apiBase}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message ?? 'AVEN could not complete that request.');
    return body;
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      request(`/workspaces/${workspace.id}/intelligence/briefing`),
      request(`/workspaces/${workspace.id}/dashboard`),
    ]).then(([briefingData, summaryData]) => { if (!cancelled) { setBriefing(briefingData); setSummary(summaryData); } })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load your dashboard.'); });
    return () => { cancelled = true; };
  }, [request, workspace.id]);

  async function toggleWidget(id: string, visible: boolean) {
    if (!summary) return;
    const hidden = visible ? summary.hiddenWidgets.filter((item) => item !== id) : [...summary.hiddenWidgets, id];
    setSaving(true); setError('');
    try {
      await request('/session/me', { method: 'PATCH', body: JSON.stringify({ dashboardHiddenWidgets: hidden }) });
      setSummary({ ...summary, hiddenWidgets: hidden });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save your dashboard layout.'); }
    finally { setSaving(false); }
  }

  const shown = (id: string) => !summary?.hiddenWidgets.includes(id);
  const events = briefing ? [...briefing.events].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 5) : [];

  return (
    <section className="home-dashboard" aria-label="Workspace dashboard">
      <div className="home-dashboard__bar">
        <div className="home-actions" aria-label="Quick actions">{quickActions.map((action) => <Link key={action.href} href={action.href}>{action.label}</Link>)}</div>
        <button type="button" className="home-customise" aria-expanded={customising} onClick={() => setCustomising((open) => !open)} disabled={!summary}>{customising ? 'Done' : 'Customise'}</button>
      </div>
      {customising && summary && <fieldset className="home-customise-panel" disabled={saving}>
        <legend>Show on your dashboard</legend>
        {Object.entries(widgetLabels).map(([id, label]) => <label key={id}><input type="checkbox" checked={shown(id)} onChange={(event) => void toggleWidget(id, event.target.checked)} />{label}</label>)}
      </fieldset>}
      {error && <p className="productivity-error" role="alert">{error}</p>}
      {!error && (!briefing || !summary) && <p className="productivity-message">Loading your workspace…</p>}

      {briefing && summary && <div className="home-grid">
        {shown('stats') && <div className="home-stats home-wide">
          {[['Open tasks', briefing.summary.openTasks, '/workspace/tasks'], ['Overdue', briefing.summary.overdueTasks, '/workspace/inbox'], ['Due this week', briefing.summary.dueThisWeek, '/workspace/inbox'], ['Active projects', briefing.summary.activeProjects, '/workspace/projects'], ['Unread in Inbox', summary.unreadInbox, '/workspace/inbox']].map(([label, value, href]) =>
            <Link key={label as string} href={href as string}><span>{label}</span><strong>{value}</strong></Link>)}
        </div>}

        {shown('nextUp') && <article className="home-card"><header><h2>My next tasks</h2><Link href="/workspace/tasks">All tasks →</Link></header>
          {summary.myTasks.length === 0 ? <p className="home-empty">Nothing assigned to you. Tasks assigned to you will appear here.</p> : <ul>{summary.myTasks.map((task) => <li key={task.id}>
            <span className={`productivity-priority productivity-priority--${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span>
            <div><Link href={`/workspace/tasks/${task.id}`}>{task.title}</Link><small>{[task.projectName, task.dueAt ? `Due ${dateOnly.format(new Date(task.dueAt))}` : 'No due date'].filter(Boolean).join(' · ')}</small></div></li>)}</ul>}
        </article>}

        {shown('projects') && <article className="home-card"><header><h2>Project progress</h2><Link href="/workspace/projects">All projects →</Link></header>
          {summary.projects.length === 0 ? <p className="home-empty">No active projects yet.</p> : <ul>{summary.projects.map((project) => {
            const percent = project.taskCount ? Math.round((project.completedTaskCount / project.taskCount) * 100) : 0;
            return <li key={project.id}><div className="home-progress"><div><Link href={`/workspace/projects/${project.id}`}>{project.name}</Link><small>{project.completedTaskCount} of {project.taskCount} tasks done{project.dueAt ? ` · due ${dateOnly.format(new Date(project.dueAt))}` : ''}</small></div>
              <span className="home-progress__bar" role="img" aria-label={`${percent}% complete`}><span style={{ width: `${percent}%` }} /></span></div></li>;
          })}</ul>}
        </article>}

        {shown('events') && <article className="home-card"><header><h2>Upcoming events</h2><Link href="/workspace/calendar">Calendar →</Link></header>
          {events.length === 0 ? <p className="home-empty">No events in the next 7 days.</p> : <ul>{events.map((event) => <li key={event.id}><div><strong>{event.title}</strong><small>{dateTime.format(new Date(event.startsAt))}{event.taskTitle ? ` · ${event.taskTitle}` : ''}</small></div></li>)}</ul>}
        </article>}

        {shown('documents') && <article className="home-card"><header><h2>Recent documents</h2><Link href="/workspace/documents">All documents →</Link></header>
          {summary.recentDocuments.length === 0 ? <p className="home-empty">Documents you write will appear here.</p> : <ul>{summary.recentDocuments.map((document) => <li key={document.id}><div><Link href={`/workspace/documents/${document.id}`}>{document.title}</Link><small>{[document.projectName, `Updated ${dateOnly.format(new Date(document.updatedAt))}`].filter(Boolean).join(' · ')}</small></div></li>)}</ul>}
        </article>}

        {shown('activity') && <article className="home-card"><header><h2>Recent activity</h2><Link href="/workspace/activity">All activity →</Link></header>
          {summary.recentActivity.length === 0 ? <p className="home-empty">Changes in this workspace will appear here.</p> : <ul>{summary.recentActivity.map((entry) => <li key={entry.id}><div><Link href={activityLink(entry.entityType, entry.entityId)}><strong>{entry.actor.displayName}</strong> {entry.message}</Link><small>{dateTime.format(new Date(entry.createdAt))}</small></div></li>)}</ul>}
        </article>}

        {shown('insights') && <article className="home-card home-wide"><header><h2>Workspace insights</h2><Link href="/workspace/intelligence">AVEN Intelligence →</Link></header>
          <ul className="home-insights">{briefing.insights.map((insight) => <li key={insight.id} className={`home-insight--${insight.tone}`}><div><Link href={insight.href}>{insight.title}</Link><small>{insight.detail}</small></div></li>)}</ul>
        </article>}
      </div>}
    </section>
  );
}
