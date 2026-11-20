'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/en';
import { ActivityChart, HorizontalBars, Sparkline } from './charts';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
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

  return <section className="workspace-settings-page analytics-page">
    <header><p className="workspace-page-eyebrow">{t('an.eyebrow')}</p><h1>{t('nav.analytics')}</h1><p>{t('an.desc')}</p></header>
    {error && <p className="workspace-settings-status" role="alert">{error}</p>}
    {locked && <div className="workspace-settings-card"><div><h2>{t('an.lockedTitle')}</h2><p>{locked}</p></div><Link className="workspace-settings-save" href="/workspace/settings">{t('an.seePlans')}</Link></div>}
    {data && <>
      <div className="analytics-window" role="group" aria-label={t('an.rangeAria')}>{[7, 30, 90].map((option) => <button key={option} aria-pressed={days === option} onClick={() => setDays(option)}>{t('an.last', { n: option })}</button>)}</div>
      <div className="analytics-tiles">
        <div><span>{t('an.created')}</span><strong>{data.totals.created}</strong></div><div><span>{t('an.completed')}</span><strong>{data.totals.completed}</strong></div>
        <div><span>{t('an.openNow')}</span><strong>{data.totals.open}</strong></div><div className={data.totals.overdue ? 'is-warn' : ''}><span>{t('an.overdue')}</span><strong>{data.totals.overdue}</strong></div>
        <div><span>{t('an.dueSoon')}</span><strong>{data.totals.dueSoon}</strong></div>
        <div><span>{t('an.typical')}</span><strong>{data.cycleDays.median === null ? '—' : `${data.cycleDays.median} d`}</strong><small>{data.cycleDays.count ? t('an.avg', { avg: data.cycleDays.average ?? 0, n: data.cycleDays.count }) : t('an.noneFinished')}</small></div>
      </div>
      <div className="workspace-settings-card"><div><h2>{t('an.createdCompleted')}</h2></div><ActivityChart daily={data.daily} /></div>
      <div className="analytics-grid-2">
        <div className="workspace-settings-card"><div><h2>{t('an.byStatus')}</h2></div><HorizontalBars rows={order(data.openByStatus, ['TODO', 'IN_PROGRESS', 'IN_REVIEW'], (key) => t(statusKeys[key]))} empty={t('an.nothingOpen')} /></div>
        <div className="workspace-settings-card"><div><h2>{t('an.byPriority')}</h2></div><HorizontalBars rows={order(data.openByPriority, ['URGENT', 'HIGH', 'MEDIUM', 'LOW'], (key) => cap(t(priorityKeys[key])))} empty={t('an.nothingOpen')} /></div>
      </div>
      <div className="workspace-settings-card"><div><h2>{t('an.workload')}</h2><p>{t('an.workloadHint')}</p></div><HorizontalBars rows={data.workload.map((row) => ({ label: row.name, value: row.open, note: row.overdue ? t('an.overdueNote', { n: row.overdue }) : undefined }))} empty={t('an.noOpenTasks')} /></div>
      {data.aiCredits.some((day) => day.credits > 0) && <div className="workspace-settings-card"><div><h2>{t('an.ai')}</h2><p>{t('an.aiRange', { n: data.aiCredits.reduce((sum, day) => sum + day.credits, 0) })}</p></div><Sparkline values={data.aiCredits.map((day) => day.credits)} labels={data.aiCredits.map((day) => day.date)} /></div>}
      {data.truncated && <p className="workspace-settings-note">{t('an.truncated')}</p>}
    </>}
  </section>;
}
