'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/en';
import { useWorkspaceSession } from '../workspace-shell';
import { TaskLabels } from '../task-labels';
import { WorkflowsWorkspace } from './workflows-workspace';
import { EmptyState, PageHeader, Panel, StatCard, StatRow } from '../ui';
import { Icon } from '../home-icons';
import { connectionError, apiFetch } from '../connection-error';

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'COMPLETED' | 'CANCELLED';
type Rule = { id: string; name: string; fromStatus: TaskStatus | null; toStatus: TaskStatus; action: 'SET_TASK_PRIORITY' | 'ADD_ACTIVITY_NOTE'; priority: string | null; activityMessage: string | null; enabled: boolean; createdAt: string; createdBy: { displayName: string }; _count: { runs: number } };
type Run = { id: string; status: 'SUCCEEDED' | 'FAILED'; summary: string; createdAt: string; rule: { name: string }; task: { id: string; title: string; labels: string[] } | null };
type AutomationData = { rules: Rule[]; runs: Run[] };

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const statuses: Array<{ value: TaskStatus; label: Key }> = [
  { value: 'TODO', label: 'status.todo' }, { value: 'IN_PROGRESS', label: 'status.inProgress' }, { value: 'IN_REVIEW', label: 'status.inReview' }, { value: 'COMPLETED', label: 'status.completed' }, { value: 'CANCELLED', label: 'status.cancelled' },
];

export function AutomationsWorkspace() {
  const { getToken } = useAuth();
  const t = useT();
  const statusLabel = (status: string) => { const option = statuses.find((item) => item.value === status); return option ? t(option.label) : status; };
  const priorityName = (value: string | null) => { const key = ({ LOW: 'prio.low', MEDIUM: 'prio.medium', HIGH: 'prio.high', URGENT: 'prio.urgent' } as Record<string, Key>)[value ?? 'MEDIUM']; return key ? t(key) : (value ?? '').toLocaleLowerCase(); };
  const { workspace } = useWorkspaceSession();
  const [data, setData] = useState<AutomationData>({ rules: [], runs: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState<'SET_TASK_PRIORITY' | 'ADD_ACTIVITY_NOTE'>('SET_TASK_PRIORITY');
  const [layout, setLayout] = useState<'LIST' | 'GRID'>('LIST');
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<'ALL' | 'ON' | 'OFF'>('ALL');
  const [triggerFilter, setTriggerFilter] = useState<'ALL' | TaskStatus>('ALL');
  const [page, setPage] = useState(1);
  const [allRuns, setAllRuns] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    if (!token || !apiBase) throw connectionError(token);
    const response = await apiFetch(`${apiBase}${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...options.headers } });
    if (!response.ok) { const body = await response.json().catch(() => null) as { message?: string } | null; throw new Error(body?.message ?? 'AVEN could not complete that request.'); }
    return response.json();
  }, [getToken]);

  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await request(`/workspaces/${workspace.id}/automations`) as AutomationData); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load automations.'); }
    finally { setLoading(false); }
  }, [request, workspace.id]);

  useEffect(() => {
    let live = true;
    async function load() {
      try { const next = await request(`/workspaces/${workspace.id}/automations`) as AutomationData; if (live) setData(next); }
      catch (reason) { if (live) setError(reason instanceof Error ? reason.message : 'Could not load automations.'); }
      finally { if (live) setLoading(false); }
    }
    void load();
    return () => { live = false; };
  }, [request, workspace.id]);

  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const action = String(form.get('action'));
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/workspaces/${workspace.id}/automations`, { method: 'POST', body: JSON.stringify({
        name: form.get('name'), fromStatus: form.get('fromStatus') || null, toStatus: form.get('toStatus'), action,
        priority: action === 'SET_TASK_PRIORITY' ? form.get('priority') : null,
        activityMessage: action === 'ADD_ACTIVITY_NOTE' ? form.get('activityMessage') : null,
      }) });
      formElement.reset();
      setAction('SET_TASK_PRIORITY');
      setNotice(t('au.saved'));
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the automation.'); }
    finally { setBusy(false); }
  }

  async function updateRule(rule: Rule, enabled: boolean) {
    setBusy(true); setError(''); setNotice('');
    try { await request(`/workspaces/${workspace.id}/automations/${rule.id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the automation.'); }
    finally { setBusy(false); }
  }

  async function deleteRule(rule: Rule) {
    if (!window.confirm(t('au.confirmDelete', { name: rule.name }))) return;
    setBusy(true); setError(''); setNotice('');
    try { await request(`/workspaces/${workspace.id}/automations/${rule.id}`, { method: 'DELETE' }); setNotice(t('au.deleted', { name: rule.name })); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete the automation.'); }
    finally { setBusy(false); }
  }

  const enabledCount = data.rules.filter((rule) => rule.enabled).length;
  const successCount = data.runs.filter((run) => run.status === 'SUCCEEDED').length;

  const lastRun = (rule: Rule) => data.runs.find((run) => run.rule.name === rule.name);
  const fmt = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  const filtered = data.rules.filter((rule) => (stateFilter === 'ALL' || (stateFilter === 'ON') === rule.enabled) && (triggerFilter === 'ALL' || rule.toStatus === triggerFilter) && (!query.trim() || rule.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const pageSize = 8; const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * pageSize, current * pageSize);
  const dayCounts = Array.from({ length: 30 }, (_, index) => { const day = new Date(nowMs - (29 - index) * 86_400_000).toDateString(); return data.runs.filter((run) => run.status === 'SUCCEEDED' && new Date(run.createdAt).toDateString() === day).length; });
  const dayLabels = Array.from({ length: 30 }, (_, index) => new Date(nowMs - (29 - index) * 86_400_000).toISOString().slice(0, 10));
  const readOnly = workspace.role === 'GUEST';
  const toggle = (rule: Rule) => <label className="rd-switch"><input type="checkbox" role="switch" checked={rule.enabled} disabled={busy || readOnly} aria-label={`${rule.name}: ${rule.enabled ? t('au.on') : t('au.off')}`} onChange={() => void updateRule(rule, !rule.enabled)} /><i /><span>{rule.enabled ? t('au.on') : t('au.off')}</span></label>;
  const menu = (rule: Rule) => <details className="rd-menu"><summary className="rd-iconbtn" aria-label={t('au.more', { name: rule.name })}><Icon name="more" size={20} /></summary><div className="rd-menu__list"><button type="button" disabled={busy || readOnly} onClick={() => void updateRule(rule, !rule.enabled)}><Icon name={rule.enabled ? 'close' : 'play'} size={16} />{rule.enabled ? t('au.pause') : t('au.enable')}</button><button type="button" className="is-danger" disabled={busy || readOnly} onClick={() => void deleteRule(rule)}><Icon name="trash" size={16} />{t('wb.delete')}</button></div></details>;
  const chips = (rule: Rule) => <><span className="rd-chip"><Icon name="checkCircle" size={15} />{rule.fromStatus ? t('au.trig.from', { from: statusLabel(rule.fromStatus), to: statusLabel(rule.toStatus) }) : t('au.trig.status', { status: statusLabel(rule.toStatus) })}</span><Icon name="arrow" size={16} /><span className="rd-chip"><Icon name={rule.action === 'SET_TASK_PRIORITY' ? 'flag' : 'edit'} size={15} />{rule.action === 'SET_TASK_PRIORITY' ? t('au.act.priority', { priority: priorityName(rule.priority).replace(/^./, (c) => c.toLocaleUpperCase()) }) : t('au.act.note')}</span></>;
  const visibleRuns = allRuns ? data.runs : data.runs.slice(0, 5);

  return <div className="workspace-section-page automations-page">
    <PageHeader eyebrow={t('act.eyebrow', { name: workspace.name })} title={t('nav.automations')} description={t('au.desc')} icon="bolt" />
    {error && <p className="productivity-error" role="alert">{error}</p>}
    {notice && <p className="automations-notice" role="status">{notice}</p>}

    <WorkflowsWorkspace />

    <StatRow columns={3} label={t('nav.automations')}>
      <StatCard icon="bolt" value={data.rules.length} label={t('au.rules')} />
      <StatCard icon="play" value={enabledCount} label={t('au.enabled')} />
      <StatCard icon="checkCircle" value={successCount} label={t('au.successful')} tone="green" aside={<span className="rd-bars" role="img" aria-label={t('au.runsChart')}>{dayCounts.map((count, index) => <i key={dayLabels[index]} style={{ height: `${8 + (count / Math.max(1, ...dayCounts)) * 32}px` }} />)}</span>} />
    </StatRow>

    <div className="automations-layout">
      <form className="productivity-form automation-create" onSubmit={createRule}>
        <h2><span className="rd-tile"><Icon name="sliders" size={22} /></span><span>{t('au.createTitle')}<small>{t('au.createHint2')}</small></span></h2>
        <label>{t('au.ruleName')}<input name="name" required maxLength={120} placeholder={t('au.ruleNamePh')} /></label>
        <label>{t('au.whenStatus')}<select name="toStatus" defaultValue="COMPLETED" required>{statuses.map((status) => <option key={status.value} value={status.value}>{t(status.label)}</option>)}</select></label>
        <label>{t('au.onlyFrom')} <span>{t('doc.optional')}</span><select name="fromStatus" defaultValue=""><option value="">{t('au.anyStatus')}</option>{statuses.map((status) => <option key={status.value} value={status.value}>{t(status.label)}</option>)}</select></label>
        <label>{t('au.then')}<select name="action" value={action} onChange={(event) => setAction(event.target.value as typeof action)}><option value="SET_TASK_PRIORITY">{t('au.setPriority')}</option><option value="ADD_ACTIVITY_NOTE">{t('au.addNote')}</option></select></label>
        {action === 'SET_TASK_PRIORITY' ? <label>{t('au.newPriority')}<select name="priority" defaultValue="HIGH"><option value="LOW">{priorityName('LOW').replace(/^./, (c) => c.toLocaleUpperCase())}</option><option value="MEDIUM">{priorityName('MEDIUM').replace(/^./, (c) => c.toLocaleUpperCase())}</option><option value="HIGH">{priorityName('HIGH').replace(/^./, (c) => c.toLocaleUpperCase())}</option><option value="URGENT">{priorityName('URGENT').replace(/^./, (c) => c.toLocaleUpperCase())}</option></select></label> : <label>{t('au.activityNote')}<textarea name="activityMessage" required maxLength={500} rows={3} placeholder={t('au.notePh')} /></label>}
        <button type="submit" disabled={busy || workspace.role === 'GUEST'}>{workspace.role === 'GUEST' ? t('au.readOnly') : busy ? t('set.saving') : <><Icon name="bolt" size={18} />{t('au.create')}</>}</button>
        <p className="automation-create__hint">{t('au.hint')}</p>
      </form>

      <Panel title={<>{t('au.yours')} <span className="rd-count">{data.rules.length}</span></>} id="automation-rules" className="automation-rules"
        actions={<><div className="rd-search"><Icon name="search" size={18} /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={t('au.search')} aria-label={t('au.search')} /></div>
          <select className="rd-select" aria-label={t('au.col.status')} value={stateFilter} onChange={(event) => { setStateFilter(event.target.value as typeof stateFilter); setPage(1); }}><option value="ALL">{t('au.filter.status', { v: t('au.filter.all') })}</option><option value="ON">{t('au.filter.status', { v: t('au.on') })}</option><option value="OFF">{t('au.filter.status', { v: t('au.off') })}</option></select>
          <select className="rd-select" aria-label={t('au.col.trigger')} value={triggerFilter} onChange={(event) => { setTriggerFilter(event.target.value as typeof triggerFilter); setPage(1); }}><option value="ALL">{t('au.filter.trigger', { v: t('au.filter.all') })}</option>{statuses.map((status) => <option key={status.value} value={status.value}>{t('au.filter.trigger', { v: t(status.label) })}</option>)}</select>
          <span className="rd-seg" role="group"><button type="button" aria-label={t('au.view.grid')} aria-pressed={layout === 'GRID'} className={layout === 'GRID' ? 'is-active' : ''} onClick={() => setLayout('GRID')}><Icon name="grid" size={18} /></button><button type="button" aria-label={t('au.view.list')} aria-pressed={layout === 'LIST'} className={layout === 'LIST' ? 'is-active' : ''} onClick={() => setLayout('LIST')}><Icon name="list" size={18} /></button></span></>}>
        {loading ? <p className="productivity-message">{t('au.loading')}</p> : data.rules.length === 0 ? <EmptyState art="stack" compact title={t('au.none')} text={t('au.noneHint')} /> : shown.length === 0 ? <EmptyState art="search" compact title={t('au.noMatch')} /> : layout === 'LIST'
          ? <div className="rd-table-wrap"><table className="rd-table rd-table--autos"><thead><tr><th>{t('au.col.automation')}</th><th>{t('au.col.trigger')} / {t('au.col.action')}</th><th>{t('au.col.status')}</th><th>{t('au.col.lastRun')}</th><th /></tr></thead><tbody>{shown.map((rule) => { const run = lastRun(rule); return <tr key={rule.id}>
              <td><div className="rd-rulecell"><span className="rd-tile rd-tile--sm"><Icon name="bolt" size={16} /></span><div><strong>{rule.name}</strong><small>{t('au.createdBy', { name: rule.createdBy.displayName })} · {t('au.runs', { n: rule._count.runs })}</small></div></div></td>
              <td><div className="rd-flow">{chips(rule)}</div></td><td>{toggle(rule)}</td>
              <td>{run ? <span className={`rd-runstate rd-runstate--${run.status.toLocaleLowerCase()}`}><Icon name={run.status === 'SUCCEEDED' ? 'checkCircle' : 'alert'} size={16} />{fmt(run.createdAt)}</span> : <span className="rd-muted">—</span>}</td><td>{menu(rule)}</td></tr>; })}</tbody></table></div>
          : <div className="automation-rule-list">{shown.map((rule) => <article className={`automation-rule${rule.enabled ? ' is-enabled' : ''}`} key={rule.id}><div className="automation-rule__top">{toggle(rule)}{menu(rule)}</div><h3>{rule.name}</h3><div className="rd-flow">{chips(rule)}</div><small>{t('au.createdBy', { name: rule.createdBy.displayName })} · {t('au.runs', { n: rule._count.runs })}</small></article>)}</div>}
        {data.rules.length > 0 && <footer className="rd-pager"><span>{t('au.shown', { shown: shown.length, total: filtered.length })}</span>{pages > 1 && <nav aria-label={t('au.page', { n: current })}><button type="button" aria-label={t('au.prev')} disabled={current === 1} onClick={() => setPage(current - 1)}><Icon name="back" size={16} /></button>{Array.from({ length: pages }, (_, index) => <button key={index} type="button" className={index + 1 === current ? 'is-active' : ''} aria-current={index + 1 === current} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button type="button" aria-label={t('au.next')} disabled={current === pages} onClick={() => setPage(current + 1)}><Icon name="chevron" size={16} /></button></nav>}</footer>}
      </Panel>
    </div>

    <Panel icon="clock" eyebrow={t('au.audit')} title={t('au.recent')} subtitle={t('au.latest', { n: data.runs.length })} id="automation-runs" className="automation-runs" actions={data.runs.length > 5 ? <button type="button" className="rd-btn rd-btn--soft" onClick={() => setAllRuns((open) => !open)}>{allRuns ? t('au.showLess') : t('au.showAll')}{!allRuns && <Icon name="arrow" size={16} />}</button> : undefined}>
      {loading ? <p className="productivity-message">{t('au.loadingRuns')}</p> : data.runs.length === 0 ? <p className="automation-runs__empty">{t('au.noRuns')}</p> : <ul className="rd-runs">{visibleRuns.map((run) => <li key={run.id}>
        <span className={`rd-runstate rd-runstate--${run.status.toLocaleLowerCase()}`} title={run.status === 'SUCCEEDED' ? t('au.complete') : t('au.failed')}><Icon name={run.status === 'SUCCEEDED' ? 'checkCircle' : 'alert'} size={22} /><span className="visually-hidden">{run.status === 'SUCCEEDED' ? t('au.complete') : t('au.failed')}</span></span>
        <div><strong>{run.rule.name}</strong><small>{run.task ? <><Link href={`/workspace/tasks/${run.task.id}`}>{run.task.title}</Link> · </> : <>{t('au.taskGone')} · </>}{run.summary}</small>{run.task && <TaskLabels labels={run.task.labels} compact />}</div>
        <time dateTime={run.createdAt}>{fmt(run.createdAt)}</time></li>)}</ul>}
    </Panel>
  </div>;
}
