'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useT } from '../i18n';
import type { Key } from '../i18n/en';
import { Icon } from './home-icons';
import { ago } from './relative-time';
import { useWorkspaceSession } from './workspace-shell';
import { connectionError, apiFetch } from './connection-error';

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

const widgetKeys: Record<string, Key> = { stats: 'widget.stats', nextUp: 'widget.nextUp', events: 'widget.events', insights: 'widget.insights', projects: 'widget.projects', documents: 'widget.documents', activity: 'widget.activity' };
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

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
  const t = useT();
  const { workspace } = useWorkspaceSession();
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [customising, setCustomising] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recentTab, setRecentTab] = useState<'ALL' | 'DOCUMENTS' | 'PROJECTS'>('ALL');
  const [ask, setAsk] = useState('');

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    if (!token || !apiBase) throw connectionError(token);
    const response = await apiFetch(`${apiBase}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, cache: 'no-store' });
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
  const insightText = briefing && briefing.insights.length ? briefing.insights.slice(0, 2).map((insight) => `${insight.title}. ${insight.detail}`).join(' ') : t('home.noInsights');
  const recents = summary ? [
    ...(recentTab !== 'PROJECTS' ? summary.recentDocuments.map((item) => ({ key: `d${item.id}`, kind: 'doc' as const, title: item.title, note: `Edited ${ago(item.updatedAt)}`, href: `/workspace/documents/${item.id}` })) : []),
    ...(recentTab !== 'DOCUMENTS' ? summary.projects.map((item) => ({ key: `p${item.id}`, kind: 'folder' as const, title: item.name, note: `${item.completedTaskCount} of ${item.taskCount} tasks done`, href: `/workspace/projects/${item.id}` })) : []),
  ].slice(0, 4) : [];
  const tiles = briefing ? [
    { icon: 'tasks' as const, label: t('home.tile.tasks'), value: briefing.summary.openTasks, caption: briefing.summary.overdueTasks ? t('home.cap.openOverdue', { n: briefing.summary.overdueTasks }) : t('home.cap.open'), href: '/workspace/tasks' },
    { icon: 'calendar' as const, label: t('home.tile.meetings'), value: todaysEvents.length, caption: t('home.cap.today'), href: '/workspace/calendar' },
    { icon: 'flag' as const, label: t('home.tile.deadlines'), value: briefing.summary.dueThisWeek, caption: t('home.cap.thisWeek'), href: '/workspace/inbox' },
    { icon: 'layers' as const, label: t('home.tile.projects'), value: briefing.summary.activeProjects, caption: t('home.cap.active'), href: '/workspace/projects' },
  ] : [];

  return (
    <section className="home" aria-label={t('home.aria')}>
      <div className="home__main">
        <header className="home-hero">
          <div>
            <h1 suppressHydrationWarning>{longDate.format(today)}</h1>
            <p className="home-hero__sub">{t('home.sub')}</p>
          </div>
          <button type="button" className="home-customise" aria-expanded={customising} onClick={() => setCustomising((open) => !open)} disabled={!summary}><Icon name="grid" size={18} />{customising ? t('home.done') : t('home.customise')}</button>
        </header>
        {customising && summary && <fieldset className="home-customise-panel" disabled={saving}>
          <legend>{t('home.showOn')}</legend>
          {Object.entries(widgetKeys).map(([id, key]) => <label key={id}><input type="checkbox" checked={shown(id)} onChange={(event) => void toggleWidget(id, event.target.checked)} />{t(key)}</label>)}
        </fieldset>}
        {error && <p className="productivity-error" role="alert">{error}</p>}
        {!error && (!briefing || !summary) && <p className="productivity-message">{t('home.loading')}</p>}

        {briefing && summary && <>
          {shown('stats') && <div className="home-tiles">{tiles.map((tile) => <Link key={tile.label} href={tile.href} className="home-tile">
            <span className="home-tile__label"><Icon name={tile.icon} size={24} />{tile.label}</span>
            <span className="home-tile__value"><strong>{tile.value}</strong><small>{tile.caption}</small></span>
          </Link>)}</div>}

          {(shown('nextUp') || shown('events')) && <div className="home-row home-row--tasks">
            {shown('nextUp') && <article className="home-card"><header><h2>{t('home.priorityTasks')}</h2><Link href="/workspace/tasks">{t('home.seeAll')} <Icon name="arrow" size={14} /></Link></header>
              {summary.myTasks.length === 0 ? <p className="home-empty">{t('home.noTasks')}</p> : <ul className="home-tasks">{summary.myTasks.slice(0, 5).map((task) => <li key={task.id}>
                <button type="button" className="home-check" aria-label={`Mark “${task.title}” complete`} onClick={() => void complete(task.id)} />
                <Link href={`/workspace/tasks/${task.id}`}>{task.title}</Link>
                <span className={`home-pill home-pill--${task.priority.toLowerCase()}`}>{['URGENT', 'HIGH', 'MEDIUM', 'LOW'].includes(task.priority) ? t(`prio.${task.priority.toLowerCase()}` as Key).replace(/^./, (c) => c.toLocaleUpperCase()) : task.priority}</span>
                <span className="home-tasks__due">{dueLabel(task.dueAt, today)}</span>
              </li>)}</ul>}
            </article>}
            {shown('events') && <article className="home-card"><header><h2>{t('home.today')}</h2><Link href="/workspace/calendar" aria-label={t('home.openCalendar')}><Icon name="arrow" size={16} /></Link></header>
              {todaysEvents.length === 0 && upcoming.length === 0 ? <p className="home-empty">{t('home.noEvents')}</p> : <ul className="home-events">
                {todaysEvents.map((event) => <li key={event.id}><time>{clock.format(new Date(event.startsAt))}</time><Link href="/workspace/calendar" className="home-event">{event.title}</Link></li>)}
                {todaysEvents.length === 0 && <li className="home-events__note">{t('home.nothingToday')}</li>}
                {todaysEvents.length === 0 && upcoming.map((event) => <li key={event.id}><time>{shortDate.format(new Date(event.startsAt))}</time><Link href="/workspace/calendar" className="home-event">{event.title}</Link></li>)}
              </ul>}
            </article>}
          </div>}

          {(shown('insights') || shown('projects')) && <div className="home-row home-row--insight">
            {shown('insights') && <article className="home-card home-brief"><div className="home-brief__title"><Icon name="sparkle" size={28} /><h2>{t('home.briefing')}</h2></div>
              <p>{insightText}</p>
              <div className="home-brief__actions"><Link className="home-button home-button--dark" href="/workspace/intelligence">{t('home.viewBriefing')} <Icon name="arrow" size={16} /></Link><Link className="home-button" href="/workspace/analytics"><Icon name="target" size={16} />{t('home.showInsights')}</Link></div>
            </article>}
            {shown('projects') && <article className="home-card"><header><h2>{t('home.projectProgress')}</h2><Link href="/workspace/projects">{t('home.seeAll')} <Icon name="arrow" size={14} /></Link></header>
              {summary.projects.length === 0 ? <p className="home-empty">{t('home.noProjects')}</p> : <ul className="home-progress-list">{summary.projects.slice(0, 4).map((project) => { const percent = project.taskCount ? Math.round((project.completedTaskCount / project.taskCount) * 100) : 0; return <li key={project.id}>
                <Link href={`/workspace/projects/${project.id}`}>{project.name}</Link><span className="home-bar" role="img" aria-label={`${percent}% complete`}><i style={{ width: `${percent}%` }} /></span><b>{percent}%</b></li>; })}</ul>}
            </article>}
          </div>}

          {shown('documents') && <section className="home-recent"><header><h2>{t('home.recent')}</h2>
            <div role="tablist" aria-label={t('home.recentItems')}>{([['ALL', 'home.tab.all'], ['DOCUMENTS', 'home.tab.documents'], ['PROJECTS', 'home.tab.projects']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={recentTab === id} onClick={() => setRecentTab(id)}>{t(label)}</button>)}</div>
            <Link href="/workspace/documents">{t('home.viewAll')} <Icon name="arrow" size={14} /></Link></header>
            {recents.length === 0 ? <p className="home-empty">{t('home.noRecent')}</p> : <div className="home-recent__cards">{recents.map((item) => <Link key={item.key} href={item.href} className="home-recent__card"><Icon name={item.kind} size={26} /><strong>{item.title}</strong><small>{item.note}</small></Link>)}</div>}
          </section>}

          {shown('activity') && <article className="home-card"><header><h2>{t('home.recentActivity')}</h2><Link href="/workspace/activity">{t('home.seeAll')} <Icon name="arrow" size={14} /></Link></header>
            {summary.recentActivity.length === 0 ? <p className="home-empty">{t('home.noActivity')}</p> : <ul className="home-activity">{summary.recentActivity.slice(0, 5).map((entry) => <li key={entry.id}><Link href={activityLink(entry.entityType, entry.entityId)}><strong>{entry.actor.displayName}</strong> {entry.message}</Link><small>{ago(entry.createdAt)}</small></li>)}</ul>}
          </article>}
        </>}
      </div>

      <aside className="home-ai" aria-label={t('ai.aria')}>
        <div className="home-ai__head"><Icon name="sparkle" size={26} /><h2>{t('ai.title')}</h2></div>
        <h3>{t('ai.heading')}</h3>
        <p>{t('ai.blurb')}</p>
        <ul>
          <li><Link href="/workspace/intelligence"><span><Icon name="sparkle" size={22} /></span><div><strong>{t('ai.daily')}</strong><small>{t('ai.dailySub')}</small></div></Link></li>
          <li><Link href="/workspace/search"><span><Icon name="search" size={22} /></span><div><strong>{t('ai.find')}</strong><small>{t('ai.findSub')}</small></div></Link></li>
          <li><Link href="/workspace/intelligence"><span><Icon name="paper" size={22} /></span><div><strong>{t('ai.action')}</strong><small>{t('ai.actionSub')}</small></div></Link></li>
          <li><Link href="/workspace/intelligence?q=Help%20me%20focus%20on%20my%20most%20important%20task"><span><Icon name="target" size={22} /></span><div><strong>{t('ai.deep')}</strong><small>{t('ai.deepSub')}</small></div></Link></li>
        </ul>
        <form onSubmit={submitAsk}>
          <label className="visually-hidden" htmlFor="home-ask">{t('ai.ask')}</label>
          <input id="home-ask" value={ask} maxLength={500} placeholder={t('ai.askPlaceholder')} onChange={(event) => setAsk(event.target.value)} />
          <button aria-label="Ask" disabled={!ask.trim()}><Icon name="arrow" size={18} /></button>
        </form>
        <div className="home-ai__chips">{[t('ai.chipDay'), t('ai.chipWeek'), t('ai.chipProject')].map((chip) => <Link key={chip} href={`/workspace/intelligence?q=${encodeURIComponent(chip)}`}>{chip}</Link>)}</div>
      </aside>
    </section>
  );
}
