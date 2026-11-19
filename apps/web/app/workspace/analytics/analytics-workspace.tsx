'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
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
const nice = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
const order = (record: Record<string, number>, keys: string[]) => keys.filter((key) => record[key]).map((key) => ({ label: nice(key), value: record[key] }));

export function AnalyticsWorkspace() {
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
    <header><p className="workspace-page-eyebrow">ANALYTICS</p><h1>Analytics</h1><p>How work is moving through this workspace: what’s being created and finished, what’s late, and who has the most on their plate.</p></header>
    {error && <p className="workspace-settings-status" role="alert">{error}</p>}
    {locked && <div className="workspace-settings-card"><div><h2>Available on a higher plan</h2><p>{locked}</p></div><Link className="workspace-settings-save" href="/workspace/settings">See plans</Link></div>}
    {data && <>
      <div className="analytics-window" role="group" aria-label="Time range">{[7, 30, 90].map((option) => <button key={option} aria-pressed={days === option} onClick={() => setDays(option)}>Last {option} days</button>)}</div>
      <div className="analytics-tiles">
        <div><span>Created</span><strong>{data.totals.created}</strong></div><div><span>Completed</span><strong>{data.totals.completed}</strong></div>
        <div><span>Open now</span><strong>{data.totals.open}</strong></div><div className={data.totals.overdue ? 'is-warn' : ''}><span>Overdue</span><strong>{data.totals.overdue}</strong></div>
        <div><span>Due in 7 days</span><strong>{data.totals.dueSoon}</strong></div>
        <div><span>Typical time to finish</span><strong>{data.cycleDays.median === null ? '—' : `${data.cycleDays.median} d`}</strong><small>{data.cycleDays.count ? `average ${data.cycleDays.average} days across ${data.cycleDays.count} tasks` : 'no tasks finished in this range'}</small></div>
      </div>
      <div className="workspace-settings-card"><div><h2>Created and completed</h2></div><ActivityChart daily={data.daily} /></div>
      <div className="analytics-grid-2">
        <div className="workspace-settings-card"><div><h2>Open work by status</h2></div><HorizontalBars rows={order(data.openByStatus, ['TODO', 'IN_PROGRESS', 'IN_REVIEW'])} empty="Nothing is open." /></div>
        <div className="workspace-settings-card"><div><h2>Open work by priority</h2></div><HorizontalBars rows={order(data.openByPriority, ['URGENT', 'HIGH', 'MEDIUM', 'LOW'])} empty="Nothing is open." /></div>
      </div>
      <div className="workspace-settings-card"><div><h2>Workload</h2><p>Open tasks per person. Overdue ones are noted.</p></div><HorizontalBars rows={data.workload.map((row) => ({ label: row.name, value: row.open, note: row.overdue ? `${row.overdue} overdue` : undefined }))} empty="No open tasks." /></div>
      {data.aiCredits.some((day) => day.credits > 0) && <div className="workspace-settings-card"><div><h2>AI credits used</h2><p>{data.aiCredits.reduce((sum, day) => sum + day.credits, 0)} credits in this range.</p></div><Sparkline values={data.aiCredits.map((day) => day.credits)} labels={data.aiCredits.map((day) => day.date)} /></div>}
      {data.truncated && <p className="workspace-settings-note">This workspace has a very large number of tasks, so these figures use the most recent 20,000.</p>}
    </>}
  </section>;
}
