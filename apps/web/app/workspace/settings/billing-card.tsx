'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { safeRedirectUrl } from './safe-redirect';
import { connectionError } from '../connection-error';
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

type Limits = Record<'projects' | 'databases' | 'workflows' | 'customAgents' | 'members' | 'storageBytes' | 'aiCredits', number | null>;
type Overview = {
  plan: { key: string; name: string; priceCents: number; perSeat: boolean }; status: string; seats: number; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean;
  limits: Limits; usage: Record<keyof Limits, number>; providerConfigured: boolean; canManage: boolean; hasBillingAccount: boolean;
  plans: { key: string; name: string; tagline?: string; priceCents: number; perSeat: boolean; selfServe: boolean; purchasable: boolean }[];
  invoices: { id: string; number: string | null; status: string; amountCents: number; currency: string; hostedUrl: string | null; createdAt: string }[];
};

const labels: Record<keyof Limits, string> = { projects: 'Projects', databases: 'Databases', workflows: 'Workflows', customAgents: 'Custom agents', members: 'Members (guests are free)', storageBytes: 'Storage', aiCredits: 'AI credits this month' };
const bytes = (n: number) => n >= 1024 ** 3 ? `${+(n / 1024 ** 3).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`;
const money = (cents: number, currency = 'aud') => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);

export function BillingCard() {
  const { workspace } = useWorkspaceSession();
  const { getToken } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const call = useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const token = await getToken();
    if (!token || !apiBase) throw connectionError(token);
    const response = await fetch(`${apiBase}/workspaces/${workspace.id}/billing${path}`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(json?.message ?? 'AVEN could not complete that request.');
    return json as T;
  }, [getToken, workspace.id]);

  useEffect(() => { void call<Overview>('').then(setData).catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load billing.')); }, [call]);

  async function go(path: string, body?: unknown) {
    setBusy(true); setMessage('');
    try { window.location.assign(safeRedirectUrl((await call<{ url: string }>(path, 'POST', body)).url, window.location.href)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Something went wrong.'); setBusy(false); }
  }

  if (!data) return <div className="workspace-settings-card"><div><h2>Plan and usage</h2><p>{message || 'Loading…'}</p></div></div>;
  return <div className="workspace-settings-card">
    <div><h2>Plan and usage</h2><p>{data.plan.name}{data.plan.priceCents ? ` · ${money(data.plan.priceCents)}${data.plan.perSeat ? ' per seat' : ''} a month` : ''}{data.plan.perSeat ? ` · ${data.seats} seat${data.seats === 1 ? '' : 's'}` : ''}{data.status !== 'FREE' && data.status !== 'ACTIVE' ? ` · ${data.status.toLowerCase().replace('_', ' ')}` : ''}{data.cancelAtPeriodEnd && data.currentPeriodEnd ? ` · ends ${new Date(data.currentPeriodEnd).toLocaleDateString()}` : ''}</p></div>
    <div className="billing-usage">{(Object.keys(labels) as (keyof Limits)[]).map((key) => { const limit = data.limits[key]; const used = data.usage[key] ?? 0; const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0; const text = key === 'storageBytes' ? `${bytes(used)} of ${limit === null ? 'unlimited' : bytes(limit)}` : `${used} of ${limit === null ? 'unlimited' : limit}`; return <div key={key} className="files-usage"><span>{labels[key]}</span><div className="files-usage__bar" role="img" aria-label={`${percent}% used`}><span style={{ width: `${percent}%` }} /></div><small>{text}</small></div>; })}</div>
    {data.canManage ? <div className="billing-actions">
      {data.plans.filter((plan) => plan.selfServe && plan.key !== data.plan.key && data.status === 'FREE').map((plan) => <button key={plan.key} className="workspace-settings-save" disabled={busy || !plan.purchasable} onClick={() => void go('/checkout', { plan: plan.key })}>Choose {plan.name} · {money(plan.priceCents)}{plan.perSeat ? '/seat' : ''}</button>)}
      {data.hasBillingAccount && <button className="workspace-settings-save" disabled={busy} onClick={() => void go('/portal')}>Manage billing</button>}
      {!data.providerConfigured && <p className="workspace-settings-note">Payments aren’t set up for this AVEN installation yet, so plans can’t be changed here.</p>}
    </div> : <p className="workspace-settings-note">Only the workspace owner can change the plan.</p>}
    {message && <p className="workspace-settings-status" role="status">{message}</p>}
    {data.invoices.length > 0 && <ul className="billing-invoices">{data.invoices.map((invoice) => <li key={invoice.id}>{new Date(invoice.createdAt).toLocaleDateString()} · {invoice.number ?? 'Invoice'} · {money(invoice.amountCents, invoice.currency)} · {invoice.status}{invoice.hostedUrl && <> · <a href={invoice.hostedUrl} target="_blank" rel="noreferrer">View</a></>}</li>)}</ul>}
  </div>;
}
