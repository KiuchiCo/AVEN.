'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { TaskLabels } from '../task-labels';

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'COMPLETED' | 'CANCELLED';
type Rule = { id: string; name: string; fromStatus: TaskStatus | null; toStatus: TaskStatus; action: 'SET_TASK_PRIORITY' | 'ADD_ACTIVITY_NOTE'; priority: string | null; activityMessage: string | null; enabled: boolean; createdAt: string; createdBy: { displayName: string }; _count: { runs: number } };
type Run = { id: string; status: 'SUCCEEDED' | 'FAILED'; summary: string; createdAt: string; rule: { name: string }; task: { id: string; title: string; labels: string[] } | null };
type AutomationData = { rules: Rule[]; runs: Run[] };

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const statuses: Array<{ value: TaskStatus; label: string }> = [
  { value: 'TODO', label: 'To do' }, { value: 'IN_PROGRESS', label: 'In progress' }, { value: 'IN_REVIEW', label: 'In review' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' },
];
const statusLabel = (status: string) => statuses.find((option) => option.value === status)?.label ?? status;

export function AutomationsWorkspace() {
  const { getToken } = useAuth();
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

  useEffect(() => { void reload(); }, [reload]);

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
      setNotice('Automation saved. It will run when a task changes to the selected status.');
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
    if (!window.confirm(`Delete “${rule.name}” and its run history?`)) return;
    setBusy(true); setError(''); setNotice('');
    try { await request(`/workspaces/${workspace.id}/automations/${rule.id}`, { method: 'DELETE' }); setNotice(`Deleted “${rule.name}”.`); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete the automation.'); }
    finally { setBusy(false); }
  }

  const enabledCount = data.rules.filter((rule) => rule.enabled).length;
  const successCount = data.runs.filter((run) => run.status === 'SUCCEEDED').length;
  const actionLabel = (rule: Rule) => rule.action === 'SET_TASK_PRIORITY' ? `Set task priority to ${rule.priority?.toLocaleLowerCase() ?? 'medium'}` : `Add activity note: “${rule.activityMessage}”`;

  return <div className="workspace-section-page automations-page">
    <p className="workspace-eyebrow">YOUR WORKSPACE · {workspace.name}</p>
    <h1>Automations</h1>
    <p className="workspace-section-page__description">Turn task status changes into consistent follow-up. Rules run immediately and leave a record in workspace activity.</p>
    {error && <p className="productivity-error" role="alert">{error}</p>}
    {notice && <p className="automations-notice" role="status">{notice}</p>}

    <div className="automations-metrics"><article><strong>{data.rules.length}</strong><span>Rules</span></article><article><strong>{enabledCount}</strong><span>Enabled</span></article><article><strong>{successCount}</strong><span>Successful runs shown</span></article></div>

    <div className="automations-layout">
      <form className="productivity-form automation-create" onSubmit={createRule}>
        <p className="workspace-eyebrow">NEW WORKFLOW</p><h2>Create an automation</h2>
        <label>Rule name<input name="name" required maxLength={120} placeholder="Mark finished tasks as urgent" /></label>
        <label>When a task changes status<select name="toStatus" defaultValue="COMPLETED" required>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
        <label>Only when it moves from <span>(optional)</span><select name="fromStatus" defaultValue=""><option value="">Any status</option>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
        <label>Then<select name="action" value={action} onChange={(event) => setAction(event.target.value as typeof action)}><option value="SET_TASK_PRIORITY">Set task priority</option><option value="ADD_ACTIVITY_NOTE">Add a workspace activity note</option></select></label>
        {action === 'SET_TASK_PRIORITY' ? <label>New priority<select name="priority" defaultValue="HIGH"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label> : <label>Activity note<textarea name="activityMessage" required maxLength={500} rows={3} placeholder="Tell the team what to do next…" /></label>}
        <button type="submit" disabled={busy || workspace.role === 'GUEST'}>{workspace.role === 'GUEST' ? 'Read-only access' : busy ? 'Saving…' : 'Create automation'}</button>
        <p className="automation-create__hint">Automation rules run after an authorized member changes a task’s status. They do not run when a task is created or when a status stays the same.</p>
      </form>

      <section className="automation-rules" aria-labelledby="automation-rules-title">
        <div className="automation-section-heading"><div><p className="workspace-eyebrow">WORKSPACE RULES</p><h2 id="automation-rules-title">Your automations</h2></div><span>{enabledCount} active</span></div>
        {loading ? <p className="productivity-message">Loading automations…</p> : data.rules.length === 0 ? <div className="automation-empty"><span aria-hidden="true">↯</span><h3>No automations yet</h3><p>Create a rule to update task priority or add a team activity note when work changes status.</p></div> : <div className="automation-rule-list">{data.rules.map((rule) => <article className={`automation-rule${rule.enabled ? '' : ' is-paused'}`} key={rule.id}>
          <div className="automation-rule__top"><span className={`automation-status${rule.enabled ? ' is-enabled' : ''}`}>{rule.enabled ? 'Enabled' : 'Paused'}</span><span>{rule._count.runs} runs</span></div>
          <h3>{rule.name}</h3>
          <p><strong>When</strong> a task moves {rule.fromStatus ? `from ${statusLabel(rule.fromStatus)} ` : ''}to {statusLabel(rule.toStatus)}</p>
          <p><strong>Then</strong> {actionLabel(rule)}</p>
          <small>Created by {rule.createdBy.displayName}</small>
          <footer><button type="button" disabled={busy || workspace.role === 'GUEST'} onClick={() => void updateRule(rule, !rule.enabled)}>{rule.enabled ? 'Pause' : 'Enable'}</button><button type="button" disabled={busy || workspace.role === 'GUEST'} onClick={() => void deleteRule(rule)}>Delete</button></footer>
        </article>)}</div>}
      </section>
    </div>

    <section className="automation-runs" aria-labelledby="automation-runs-title">
      <div className="automation-section-heading"><div><p className="workspace-eyebrow">AUDIT TRAIL</p><h2 id="automation-runs-title">Recent runs</h2></div><span>Latest {data.runs.length}</span></div>
      {loading ? <p className="productivity-message">Loading run history…</p> : data.runs.length === 0 ? <p className="automation-runs__empty">Automation activity will appear here when a rule runs.</p> : <div className="automation-run-list">{data.runs.map((run) => <article key={run.id}>
        <span className={`automation-run-status automation-run-status--${run.status.toLocaleLowerCase()}`}>{run.status === 'SUCCEEDED' ? 'Complete' : 'Failed'}</span>
        <div><strong>{run.rule.name}</strong><small>{run.task ? `Task · ${run.task.title}` : 'Task no longer exists'} · {run.summary}</small>{run.task && <TaskLabels labels={run.task.labels} compact />}</div>
        <time dateTime={run.createdAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(run.createdAt))}</time>
      </article>)}</div>}
    </section>
  </div>;
}
