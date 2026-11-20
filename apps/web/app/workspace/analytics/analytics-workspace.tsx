'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/en';
import { ActivityChart, Donut, HorizontalBars, Sparkline, VelocityChart } from './charts';
import { Icon } from '../home-icons';
import { EmptyState, PageHeader, Panel, PillTabs, StatCard, StatRow } from '../ui';
import { ago } from '../relative-time';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
type ProjectRow = { id: string; name: string; status: string; updatedAt: string };
type TaskRow = { id: string; status: string; dueAt: string | null; updatedAt?: string; project: { id: string } | null };
type Tab = 'OVERVIEW' | 'PROJECTS' | 'TASKS' | 'TEAM' | 'TRENDS';
type Data = {
  range: { from: string; to: string; days: number }; truncated: boolean;
  totals: { created: number; completed: number; open: number; overdue: number; dueSoon: number };
  daily: { date: string; created: number; completed: number }[];
  cycleDays: { count: number; average: number | null; median: number | null };
  openByStatus: Record<string, number>; openByPriority: Record<string, number>;
  workload: { assigneeId: string | null; name: string; open: number; overdue: number }[];
  aiCredits: { date: string; credits: number }[];
};
const statusKeys: Record<string, Key> = { TODO: 'status.todo', IN_PROGRESS: 'status.inProgress', IN_REVIEW: 'status.inReview' };
const priorityKeys: Record<string, Key> = { URGENT: 'prio.urgent', HIGH: 'prio.high', MEDIUM: 'prio.medium', LOW: 'prio.low' };
const cap = (value: string) => value.replace(/^./, (c) => c.toLocaleUpperCase());
const order = (record: Record<string, number>, keys: string[], labels: (key: string) => string) => keys.filter((key) => record[key]).map((key) => ({ label: labels(key), value: record[key] }));

export function AnalyticsWorkspace() {
  const t = useT();
  const { workspace } = useWorkspaceSession();
  const { getToken } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [locked, setLocked] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('OVERVIEW');
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [query, setQuery] = useState('');

  const fetchAnalytics = useCallback(async (): Promise<{ data?: Data; locked?: string; error?: string }> => {
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/workspaces/${workspace.id}/analytics?days=${days}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const body = await response.json().catch(() => null);
      if (response.status === 402) return { locked: body?.message ?? 'Analytics isn’t included in your plan.' };
      if (!response.ok) return { error: body?.message ?? 'Could not load analytics.' };
      return { data: body as Data };
    } catch { return { error: 'Could not load analytics.' }; }
  }, [days, getToken, workspace.id]);
  useEffect(() => {
    let live = true;
    void fetchAnalytics().then((result) => { if (live) { setData(result.data ?? null); setLocked(result.locked ?? ''); setError(result.error ?? ''); } });
    return () => { live = false; };
  }, [fetchAnalytics]);

  useEffect(() => {
    if (!data) return;
    let live = true;
    void (async () => {
      try {
        const token = await getToken(); const headers = { Authorization: `Bearer ${token}` };
        const [projectRows, taskRows] = await Promise.all([fetch(`${apiBase}/workspaces/${workspace.id}/projects`, { headers }).then((response) => response.ok ? response.json() : []), fetch(`${apiBase}/workspaces/${workspace.id}/tasks`, { headers }).then((response) => response.ok ? response.json() : [])]) as [ProjectRow[], TaskRow[]];
        if (live) { setProjects(projectRows); setTasks(taskRows); }
      } catch { /* the charts above still work without the project table */ }
    })();
    return () => { live = false; };
  }, [data, getToken, workspace.id]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const projectRows = projects.map((project) => {
    const own = tasks.filter((task) => task.project?.id === project.id);
    const open = own.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED');
    const overdue = open.filter((task) => task.dueAt && task.dueAt.slice(0, 10) < todayKey).length;
    const done = own.filter((task) => task.status === 'COMPLETED').length;
    const latest = own.reduce((best, task) => (task.updatedAt && task.updatedAt > best ? task.updatedAt : best), project.updatedAt);
    return { ...project, total: own.length, open: open.length, overdue, progress: own.length ? Math.round((done / own.length) * 100) : 0, latest, health: overdue === 0 ? 'ON' : open.length && overdue / open.length >= 0.5 ? 'OFF' : 'RISK' };
  });
  const activeProjects = projectRows.filter((project) => project.status !== 'COMPLETED' && project.status !== 'ARCHIVED');
  const health = { ON: activeProjects.filter((project) => project.health === 'ON').length, RISK: activeProjects.filter((project) => project.health === 'RISK').length, OFF: activeProjects.filter((project) => project.health === 'OFF').length };
  const healthPercent = activeProjects.length ? Math.round((health.ON / activeProjects.length) * 100) : 0;
  const shownProjects = projectRows.filter((project) => !query.trim() || project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const statusCounts = { COMPLETED: tasks.filter((task) => task.status === 'COMPLETED').length, IN_PROGRESS: tasks.filter((task) => task.status === 'IN_PROGRESS').length, TODO: tasks.filter((task) => task.status === 'TODO').length, IN_REVIEW: tasks.filter((task) => task.status === 'IN_REVIEW').length, OVERDUE: tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && task.dueAt && task.dueAt.slice(0, 10) < todayKey).length };
  const statusMax = Math.max(1, ...Object.values(statusCounts));
  function exportProjects() {
    const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const lines = [[t('an.col.project'), t('an.col.progress'), t('an.col.tasks'), t('an.col.overdue'), t('an.col.last')].map(quote).join(','), ...shownProjects.map((row) => [row.name, `${row.progress}%`, row.total, row.overdue, new Date(row.latest).toISOString()].map(quote).join(','))];
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'aven-projects.csv'; link.click(); URL.revokeObjectURL(url);
  }

  return <section className="workspace-settings-page analytics-page">
    <PageHeader eyebrow={t('an.eyebrow')} title={t('nav.analytics')} description={t('an.desc')} />
    {error && <p className="workspace-settings-status" role="alert">{error}</p>}
    {locked && <Panel icon="chart" title={t('an.lockedTitle')} subtitle={locked} id="an-locked" actions={<Link className="rd-btn" href="/workspace/settings">{t('an.seePlans')}</Link>}><span /></Panel>}
    {data && <>
      <div className="rd-listbar"><PillTabs label={t('an.tabsAria')} value={tab} onChange={setTab} items={[{ key: 'OVERVIEW', label: t('an.tab.overview'), icon: 'grid' }, { key: 'PROJECTS', label: t('an.tab.projects'), icon: 'folder' }, { key: 'TASKS', label: t('an.tab.tasks'), icon: 'tasks' }, { key: 'TEAM', label: t('an.tab.team'), icon: 'users' }, { key: 'TRENDS', label: t('an.tab.trends'), icon: 'trend' }]} />
        <label className="rd-inline"><Icon name="calendar" size={18} /><select className="rd-select analytics-window" value={days} aria-label={t('an.rangeAria')} onChange={(event) => setDays(Number(event.target.value))}>{[7, 30, 90].map((option) => <option key={option} value={option}>{t('an.last', { n: option })}</option>)}</select></label></div>
      {tab === 'OVERVIEW' && <>
        <StatRow label={t('an.rangeAria')}>
          <StatCard icon="folder" value={activeProjects.length} label={t('an.k.active')} />
          <StatCard icon="checkCircle" value={data.totals.completed} label={t('an.k.completed')} tone="green" />
          <StatCard icon="clock" value={data.totals.overdue} label={t('an.k.overdue')} tone="red" />
          <StatCard icon="layers" value={data.openByStatus.IN_PROGRESS ?? 0} label={t('an.k.inProgress')} tone="violet" />
        </StatRow>
        <div className="rd-grid rd-grid--three analytics-trio">
          <Panel title={t('an.projectProgress')} id="an-progress"><div className="analytics-donutrow"><Donut centre={`${healthPercent}%`} caption={t('an.onTrack')} slices={[{ value: health.ON, className: 'analytics-donut__on' }, { value: health.RISK, className: 'analytics-donut__risk' }, { value: health.OFF, className: 'analytics-donut__off' }]} /><ul className="analytics-legend" title={t('an.donutRule')}><li><i className="is-on" />{t('an.onTrack')}<strong>{health.ON}</strong></li><li><i className="is-risk" />{t('an.atRisk')}<strong>{health.RISK}</strong></li><li><i className="is-off" />{t('an.offTrack')}<strong>{health.OFF}</strong></li></ul></div></Panel>
          <Panel title={t('an.velocity')} id="an-velocity"><VelocityChart daily={data.daily} /></Panel>
          <Panel title={t('an.statusAll')} id="an-status"><ul className="analytics-statusbars">{([['COMPLETED', 'an.s.completed', 'is-done'], ['IN_PROGRESS', 'an.s.inProgress', 'is-doing'], ['TODO', 'an.s.planned', 'is-todo'], ['IN_REVIEW', 'an.s.inReview', 'is-review'], ['OVERDUE', 'an.s.overdue', 'is-late']] as const).map(([key, label, tone]) => <li key={key}><span>{t(label)}</span><div><i className={tone} style={{ width: `${(statusCounts[key] / statusMax) * 100}%` }} /></div><strong>{statusCounts[key]}</strong></li>)}</ul></Panel>
        </div>
      </>}
      {(tab === 'OVERVIEW' || tab === 'PROJECTS') && <Panel title={t('an.perf')} subtitle={t('an.perfHint')} id="an-perf" className="analytics-perf" actions={<><div className="rd-search"><Icon name="search" size={18} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('an.searchProjects')} aria-label={t('an.searchProjects')} /></div><button type="button" className="rd-btn rd-btn--soft" disabled={shownProjects.length === 0} onClick={exportProjects}><Icon name="download" size={18} />{t('an.exportCsv')}</button></>}>
        {shownProjects.length === 0 ? <EmptyState art="folder" compact title={t('an.noProjects')} /> : <div className="rd-table-wrap"><table className="rd-table"><thead><tr><th>{t('an.col.project')}</th><th>{t('an.col.progress')}</th><th>{t('an.col.tasks')}</th><th>{t('an.col.overdue')}</th><th>{t('an.col.last')}</th></tr></thead><tbody>{shownProjects.map((row) => <tr key={row.id}><td><Link className="rd-namecell" href={`/workspace/projects/${row.id}`} aria-label={t('an.openProject', { name: row.name })}><Icon name="folder" size={20} />{row.name}</Link></td><td><div className="rd-progress"><span>{row.progress}%</span><div><i style={{ width: `${row.progress}%` }} /></div></div></td><td>{row.total}</td><td><span className={`rd-pill rd-pill--${row.overdue ? 'red' : 'green'}`}>{row.overdue}</span></td><td>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.latest))}<small className="rd-muted"> · {ago(row.latest)}</small></td></tr>)}</tbody></table></div>}
      </Panel>}
      {tab === 'TASKS' && <>
        <StatRow columns={3} label={t('an.rangeAria')}>
          <StatCard icon="tasks" value={data.totals.open} label={t('an.openNow')} /><StatCard icon="clock" value={data.totals.overdue} label={t('an.overdue')} tone="red" /><StatCard icon="flag" value={data.totals.dueSoon} label={t('an.dueSoon')} tone="violet" />
        </StatRow>
        <div className="rd-grid rd-grid--two">
          <Panel title={t('an.byStatus')} id="an-bystatus"><HorizontalBars rows={order(data.openByStatus, ['TODO', 'IN_PROGRESS', 'IN_REVIEW'], (key) => t(statusKeys[key]))} empty={t('an.nothingOpen')} /></Panel>
          <Panel title={t('an.byPriority')} id="an-byprio"><HorizontalBars rows={order(data.openByPriority, ['URGENT', 'HIGH', 'MEDIUM', 'LOW'], (key) => cap(t(priorityKeys[key])))} empty={t('an.nothingOpen')} /></Panel>
        </div>
        <Panel title={t('an.typical')} id="an-cycle"><p className="analytics-cycle"><strong>{data.cycleDays.median === null ? '—' : `${data.cycleDays.median} d`}</strong> <span className="rd-muted">{data.cycleDays.count ? t('an.avg', { avg: data.cycleDays.average ?? 0, n: data.cycleDays.count }) : t('an.noneFinished')}</span></p></Panel>
      </>}
      {tab === 'TEAM' && <Panel title={t('an.workload')} subtitle={t('an.workloadHint')} id="an-workload"><HorizontalBars rows={data.workload.map((row) => ({ label: row.name, value: row.open, note: row.overdue ? t('an.overdueNote', { n: row.overdue }) : undefined }))} empty={t('an.noOpenTasks')} /></Panel>}
      {tab === 'TRENDS' && <>
        <StatRow columns={2} label={t('an.rangeAria')}><StatCard icon="plus" value={data.totals.created} label={t('an.created')} tone="bronze" /><StatCard icon="checkCircle" value={data.totals.completed} label={t('an.completed')} tone="green" /></StatRow>
        <Panel title={t('an.createdCompleted')} id="an-trend"><ActivityChart daily={data.daily} /></Panel>
        {data.aiCredits.some((day) => day.credits > 0) && <Panel title={t('an.ai')} subtitle={t('an.aiRange', { n: data.aiCredits.reduce((sum, day) => sum + day.credits, 0) })} id="an-ai"><Sparkline values={data.aiCredits.map((day) => day.credits)} labels={data.aiCredits.map((day) => day.date)} /></Panel>}
      </>}
      {data.truncated && <p className="workspace-settings-note">{t('an.truncated')}</p>}
    </>}
  </section>;
}
