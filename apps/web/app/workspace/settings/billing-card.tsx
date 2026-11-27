'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/en';
import { useWorkspaceSession } from '../workspace-shell';
import { safeRedirectUrl } from './safe-redirect';
import { connectionError, apiFetch } from '../connection-error';
import { formatBytes } from '../files/types';
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

type Limits = Record<'projects' | 'databases' | 'workflows' | 'customAgents' | 'members' | 'storageBytes' | 'aiCredits', number | null>;
type Plan = { key: string; name: string; tagline?: string; priceCents: number | null; perSeat: boolean; selfServe: boolean; purchasable: boolean; limits?: Limits; perSeatLimits?: Partial<Pick<Limits, 'storageBytes' | 'aiCredits'>> | null; features?: string[] };
type Overview = {
  plan: { key: string; name: string; priceCents: number | null; perSeat: boolean }; status: string; seats: number; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean;
  limits: Limits; usage: Record<keyof Limits, number>; providerConfigured: boolean; canManage: boolean; hasBillingAccount: boolean;
  plans: Plan[];
  invoices: { id: string; number: string | null; status: string; amountCents: number; currency: string; hostedUrl: string | null; createdAt: string }[];
};

const usageKeys: Record<keyof Limits, Key> = { projects: 'bill.u.projects', databases: 'bill.u.databases', workflows: 'bill.u.workflows', customAgents: 'bill.u.customAgents', members: 'bill.u.members', storageBytes: 'bill.u.storage', aiCredits: 'bill.u.ai' };
const knownPlans = ['FREE', 'PLUS', 'PRO', 'BUSINESS', 'ENTERPRISE'];
const knownStatuses = ['TRIALING', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'UNPAID', 'PAUSED'];
const knownFeatures = ['advancedAutomation', 'aiAgents', 'analytics', 'auditLog', 'rolePermissions'];
const pageLanguage = () => (typeof document !== 'undefined' && document.documentElement.lang) || undefined;

/** Plan, usage, and what each plan offers. Plans are chosen here; an existing subscription is managed in the payment provider's portal. */
export function BillingCard() {
  const t = useT();
  const { workspace } = useWorkspaceSession();
  const { getToken } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const money = (cents: number, currency = 'aud') => new Intl.NumberFormat(pageLanguage(), { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
  const number = (value: number) => new Intl.NumberFormat(pageLanguage()).format(value);
  const planName = (plan: { key: string; name: string }) => (knownPlans.includes(plan.key) ? t(`bill.plan.${plan.key}` as Key) : plan.name);

  const call = useCallback(async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    const token = await getToken();
    if (!token || !apiBase) throw connectionError(token);
    const response = await apiFetch(`${apiBase}/workspaces/${workspace.id}/billing${path}`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(json?.message ?? 'AVEN could not complete that request.');
    return json as T;
  }, [getToken, workspace.id]);

  useEffect(() => { void call<Overview>('').then(setData).catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load billing.')); }, [call]);

  async function go(path: string, body?: unknown) {
    setBusy(true); setMessage('');
    try { window.location.assign(safeRedirectUrl((await call<{ url: string }>(path, 'POST', body)).url, window.location.href)); }
    catch (error) { setMessage(error instanceof Error ? error.message : t('bill.failed')); setBusy(false); }
  }

  if (!data) return <div className="workspace-settings-card"><div><h2>{t('bill.title')}</h2>{message ? <p role="alert">{message}</p> : <p role="status">{t('bill.loading')}</p>}</div></div>;

  const price = (plan: Pick<Plan, 'priceCents' | 'perSeat'>) => plan.priceCents === null ? t('bill.byAgreement') : t(plan.perSeat ? 'bill.pricePerSeat' : 'bill.price', { price: money(plan.priceCents) });
  const status = data.status !== 'FREE' && data.status !== 'ACTIVE' ? (knownStatuses.includes(data.status) ? t(`bill.s.${data.status}` as Key) : data.status.toLowerCase().replace(/_/g, ' ')) : '';
  const summary = [planName(data.plan), data.plan.priceCents ? price(data.plan) : '', data.plan.perSeat ? t(data.seats === 1 ? 'bill.seatOne' : 'bill.seats', { n: data.seats }) : '', status, data.cancelAtPeriodEnd && data.currentPeriodEnd ? t('bill.endsOn', { date: new Date(data.currentPeriodEnd).toLocaleDateString(pageLanguage()) }) : ''].filter(Boolean).join(' · ');
  const subscribed = data.status !== 'FREE';
  const highlights = (plan: Plan) => {
    const limits = plan.limits; if (!limits) return [];
    const lines: string[] = [];
    lines.push(limits.projects === null ? t('bill.l.projectsAll') : t('bill.l.projects', { n: number(limits.projects) }));
    lines.push(limits.members === null ? t('bill.l.membersAll') : t('bill.l.members', { n: number(limits.members) }));
    if (plan.perSeatLimits?.storageBytes) lines.push(t('bill.l.storageSeat', { size: formatBytes(plan.perSeatLimits.storageBytes) }));
    else lines.push(limits.storageBytes === null ? t('bill.l.storageAll') : t('bill.l.storage', { size: formatBytes(limits.storageBytes) }));
    if (plan.perSeatLimits?.aiCredits) lines.push(t('bill.l.aiSeat', { n: number(plan.perSeatLimits.aiCredits) }));
    else lines.push(limits.aiCredits === null ? t('bill.l.aiAll') : t('bill.l.ai', { n: number(limits.aiCredits) }));
    for (const feature of plan.features ?? []) if (knownFeatures.includes(feature)) lines.push(t(`bill.f.${feature}` as Key));
    return lines;
  };

  return <div className="workspace-settings-card billing-card">
    <div><h2>{t('bill.title')}</h2><p>{summary}</p></div>
    <div className="billing-usage">{(Object.keys(usageKeys) as (keyof Limits)[]).map((key) => {
      const limit = data.limits[key]; const used = data.usage[key] ?? 0; const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
      const show = (value: number) => (key === 'storageBytes' ? formatBytes(value) : number(value));
      return <div key={key} className="files-usage"><span>{t(usageKeys[key])}</span><div className="files-usage__bar" role="img" aria-label={t('bill.percentUsed', { n: percent })}><span style={{ width: `${percent}%` }} /></div><small>{t('bill.ofLimit', { used: show(used), limit: limit === null ? t('bill.unlimited') : show(limit) })}</small></div>;
    })}</div>

    <section className="billing-plans" aria-labelledby="billing-plans-title">
      <h3 id="billing-plans-title">{t('bill.plans')}</h3>
      <ul>{data.plans.map((plan) => {
        const current = plan.key === data.plan.key;
        const action = !data.canManage || current ? null
          : !plan.selfServe && plan.key !== 'FREE' ? <p className="billing-plan__note">{t('bill.enterprise')}</p>
          : subscribed ? <p className="billing-plan__note">{t('bill.changeInPortal')}</p>
          : <><button type="button" className="rd-btn rd-btn--small" disabled={busy || !plan.purchasable} aria-describedby={!plan.purchasable ? `plan-${plan.key}-why` : undefined} onClick={() => void go('/checkout', { plan: plan.key })}>{t('bill.choose', { plan: planName(plan) })}</button>{!plan.purchasable && data.providerConfigured && <p id={`plan-${plan.key}-why`} className="billing-plan__note">{t('bill.notBuyable')}</p>}{!plan.purchasable && !data.providerConfigured && <span id={`plan-${plan.key}-why`} className="visually-hidden">{t('bill.notConfigured')}</span>}</>;
        return <li key={plan.key} className={`billing-plan${current ? ' is-current' : ''}`}>
          <div className="billing-plan__head"><h4>{planName(plan)}</h4>{current && <span className="billing-plan__current">{t('bill.current')}</span>}</div>
          <p className="billing-plan__price">{price(plan)}</p>
          {knownPlans.includes(plan.key) && <p className="billing-plan__tagline">{t(`bill.tag.${plan.key}` as Key)}</p>}
          <ul className="billing-plan__list">{highlights(plan).map((line) => <li key={line}>{line}</li>)}</ul>
          {action}
        </li>;
      })}</ul>
    </section>

    {data.canManage ? <div className="billing-actions">
      {data.hasBillingAccount && <button type="button" className="workspace-settings-save" disabled={busy} onClick={() => void go('/portal')}>{t('bill.manage')}</button>}
      {!data.providerConfigured && <p className="workspace-settings-note">{t('bill.notConfigured')}</p>}
    </div> : <p className="workspace-settings-note">{t('bill.ownerOnly')}</p>}
    {message && <p className="workspace-settings-status" role="alert">{message}</p>}
    {data.invoices.length > 0 && <ul className="billing-invoices">{data.invoices.map((invoice) => <li key={invoice.id}>{new Date(invoice.createdAt).toLocaleDateString(pageLanguage())} · {invoice.number ?? t('bill.invoice')} · {money(invoice.amountCents, invoice.currency)} · {invoice.status}{invoice.hostedUrl && <> · <a href={invoice.hostedUrl} target="_blank" rel="noreferrer">{t('bill.view')}</a></>}</li>)}</ul>}
  </div>;
}
