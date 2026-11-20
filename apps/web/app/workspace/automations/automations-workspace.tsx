'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/en';
import { useWorkspaceSession } from '../workspace-shell';
import { TaskLabels } from '../task-labels';
import { WorkflowsWorkspace } from './workflows-workspace';
import { PageHeader } from '../ui';

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

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to its API. Check your local API setup.');
    const response = await fetch(`${apiBase}${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...options.headers } });
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
  const actionLabel = (rule: Rule) => rule.action === 'SET_TASK_PRIORITY' ? t('au.setPriorityTo', { priority: priorityName(rule.priority) }) : t('au.addNoteQuoted', { note: rule.activityMessage ?? '' });

  return <div className="workspace-section-page automations-page">
    <PageHeader eyebrow={t('act.eyebrow', { name: workspace.name })} title={t('nav.automations')} description={t('au.desc')} icon="bolt" />
    {error && <p className="productivity-error" role="alert">{error}</p>}
    {notice && <p className="automations-notice" role="status">{notice}</p>}

    <WorkflowsWorkspace />

    <div className="automations-metrics"><article><strong>{data.rules.length}</strong><span>{t('au.rules')}</span></article><article><strong>{enabledCount}</strong><span>{t('au.enabled')}</span></article><article><strong>{successCount}</strong><span>{t('au.successful')}</span></article></div>

    <div className="automations-layout">
      <form className="productivity-form automation-create" onSubmit={createRule}>
        <p className="workspace-eyebrow">{t('au.simple')}</p><h2>{t('au.createTitle')}</h2>
        <label>{t('au.ruleName')}<input name="name" required maxLength={120} placeholder={t('au.ruleNamePh')} /></label>
        <label>{t('au.whenStatus')}<select name="toStatus" defaultValue="COMPLETED" required>{statuses.map((status) => <option key={status.value} value={status.value}>{t(status.label)}</option>)}</select></label>
        <label>{t('au.onlyFrom')} <span>{t('doc.optional')}</span><select name="fromStatus" defaultValue=""><option value="">{t('au.anyStatus')}</option>{statuses.map((status) => <option key={status.value} value={status.value}>{t(status.label)}</option>)}</select></label>
        <label>{t('au.then')}<select name="action" value={action} onChange={(event) => setAction(event.target.value as typeof action)}><option value="SET_TASK_PRIORITY">{t('au.setPriority')}</option><option value="ADD_ACTIVITY_NOTE">{t('au.addNote')}</option></select></label>
        {action === 'SET_TASK_PRIORITY' ? <label>{t('au.newPriority')}<select name="priority" defaultValue="HIGH"><option value="LOW">{priorityName('LOW').replace(/^./, (c) => c.toLocaleUpperCase())}</option><option value="MEDIUM">{priorityName('MEDIUM').replace(/^./, (c) => c.toLocaleUpperCase())}</option><option value="HIGH">{priorityName('HIGH').replace(/^./, (c) => c.toLocaleUpperCase())}</option><option value="URGENT">{priorityName('URGENT').replace(/^./, (c) => c.toLocaleUpperCase())}</option></select></label> : <label>{t('au.activityNote')}<textarea name="activityMessage" required maxLength={500} rows={3} placeholder={t('au.notePh')} /></label>}
        <button type="submit" disabled={busy || workspace.role === 'GUEST'}>{workspace.role === 'GUEST' ? t('au.readOnly') : busy ? t('set.saving') : t('au.create')}</button>
        <p className="automation-create__hint">{t('au.hint')}</p>
      </form>

      <section className="automation-rules" aria-labelledby="automation-rules-title">
        <div className="automation-section-heading"><div><p className="workspace-eyebrow">{t('au.workspaceRules')}</p><h2 id="automation-rules-title">{t('au.yours')}</h2></div><span>{t('au.active', { n: enabledCount })}</span></div>
        {loading ? <p className="productivity-message">{t('au.loading')}</p> : data.rules.length === 0 ? <div className="automation-empty"><span aria-hidden="true">↯</span><h3>{t('au.none')}</h3><p>{t('au.noneHint')}</p></div> : <div className="automation-rule-list">{data.rules.map((rule) => <article className={`automation-rule${rule.enabled ? '' : ' is-paused'}`} key={rule.id}>
          <div className="automation-rule__top"><span className={`automation-status${rule.enabled ? ' is-enabled' : ''}`}>{rule.enabled ? t('au.enabled') : t('au.paused')}</span><span>{t('au.runs', { n: rule._count.runs })}</span></div>
          <h3>{rule.name}</h3>
          <p><strong>{t('au.when')}</strong> {t('au.whenText', { from: rule.fromStatus ? t('au.fromText', { status: statusLabel(rule.fromStatus) }) : '', to: statusLabel(rule.toStatus) })}</p>
          <p><strong>{t('au.then')}</strong> {actionLabel(rule)}</p>
          <small>{t('au.createdBy', { name: rule.createdBy.displayName })}</small>
          <footer><button type="button" disabled={busy || workspace.role === 'GUEST'} onClick={() => void updateRule(rule, !rule.enabled)}>{rule.enabled ? t('au.pause') : t('au.enable')}</button><button type="button" disabled={busy || workspace.role === 'GUEST'} onClick={() => void deleteRule(rule)}>{t('wb.delete')}</button></footer>
        </article>)}</div>}
      </section>
    </div>

    <section className="automation-runs" aria-labelledby="automation-runs-title">
      <div className="automation-section-heading"><div><p className="workspace-eyebrow">{t('au.audit')}</p><h2 id="automation-runs-title">{t('au.recent')}</h2></div><span>{t('au.latest', { n: data.runs.length })}</span></div>
      {loading ? <p className="productivity-message">{t('au.loadingRuns')}</p> : data.runs.length === 0 ? <p className="automation-runs__empty">{t('au.noRuns')}</p> : <div className="automation-run-list">{data.runs.map((run) => <article key={run.id}>
        <span className={`automation-run-status automation-run-status--${run.status.toLocaleLowerCase()}`}>{run.status === 'SUCCEEDED' ? t('au.complete') : t('au.failed')}</span>
        <div><strong>{run.rule.name}</strong><small>{run.task ? <>{t('au.taskDot')} · <Link href={`/workspace/tasks/${run.task.id}`}>{run.task.title}</Link></> : t('au.taskGone')} · {run.summary}</small>{run.task && <TaskLabels labels={run.task.labels} compact />}</div>
        <time dateTime={run.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(run.createdAt))}</time>
      </article>)}</div>}
    </section>
  </div>;
}
