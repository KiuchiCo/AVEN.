'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useT } from '../../i18n';
import type { Key } from '../../i18n/en';
import { useWorkspaceSession } from '../workspace-shell';
import { describeTriggerWith, emptyTrigger, fromApiStep, fromApiTrigger, newStep, outputStepIds, stepLabelKeys, toApiStep, toApiTrigger, type RunRecord, type StepDraft, type StepType, type TriggerDraft, type WorkflowDetail, type WorkflowSummary } from './workflow-types';
import { connectionError } from '../connection-error';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const statuses: [string, Key][] = [['TODO', 'status.todo'], ['IN_PROGRESS', 'status.inProgress'], ['IN_REVIEW', 'status.inReview'], ['COMPLETED', 'status.completed'], ['CANCELLED', 'status.cancelled']];
const priorities: [string, Key][] = [['LOW', 'prio.low'], ['MEDIUM', 'prio.medium'], ['HIGH', 'prio.high'], ['URGENT', 'prio.urgent']];
const operators: [string, Key][] = [['equals', 'wf.op.equals'], ['not_equals', 'wf.op.not_equals'], ['contains', 'wf.op.contains'], ['not_contains', 'wf.op.not_contains'], ['is_empty', 'wf.op.is_empty'], ['is_not_empty', 'wf.op.is_not_empty'], ['greater_than', 'wf.op.greater_than'], ['less_than', 'wf.op.less_than']];
const taskFields: [string, Key][] = [['task.status', 'wf.f.status'], ['task.priority', 'wf.f.priority'], ['task.title', 'wf.f.title'], ['task.description', 'wf.f.description'], ['task.labels', 'wf.f.labels'], ['task.assigneeId', 'wf.f.assignee'], ['task.daysUntilDue', 'wf.f.daysUntilDue']];
const weekdayKeys = [0, 1, 2, 3, 4, 5, 6].map((day) => `wd.${day}` as Key);
const triggerKeys: Record<string, Key> = { task_status_changed: 'wf.trig.statusChanged', task_created: 'wf.trig.created', schedule: 'wf.trig.schedule', manual: 'wf.trig.manual' };
const cap = (value: string) => value.replace(/^./, (c) => c.toLocaleUpperCase());
const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
type Project = { id: string; name: string };
type TaskOption = { id: string; title: string };

export function WorkflowsWorkspace() {
  const { getToken } = useAuth();
  const t = useT();
  const statusText = (value: string) => { const map: Record<string, Key> = { SUCCEEDED: 'wf.st.succeeded', FAILED: 'wf.st.failed', RUNNING: 'wf.st.running', QUEUED: 'wf.st.queued', WAITING: 'wf.st.waiting', SKIPPED: 'wf.st.skipped' }; return map[value] ? t(map[value]) : value.toLowerCase(); };
  const { workspace } = useWorkspaceSession();
  const base = `${apiBase}/workspaces/${workspace.id}`;
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [editing, setEditing] = useState<WorkflowDetail | 'new' | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [runPicker, setRunPicker] = useState<{ id: string; tasks: TaskOption[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const call = useCallback(async <T,>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
    const token = await getToken();
    if (!token || !apiBase) throw connectionError(token);
    const response = await fetch(`${base}${path}`, { method: init.method ?? 'GET', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error((body as { message?: string } | null)?.message ?? 'AVEN could not complete that request.');
    return body as T;
  }, [base, getToken]);

  const reload = useCallback(async () => setWorkflows(await call<WorkflowSummary[]>('/workflows')), [call]);
  useEffect(() => {
    let live = true;
    void Promise.all([call<WorkflowSummary[]>('/workflows'), call<Project[]>('/projects')])
      .then(([list, projectList]) => { if (live) { setWorkflows(list); setProjects(projectList); } })
      .catch((reason) => { if (live) setError(reason instanceof Error ? reason.message : 'Could not load workflows.'); });
    return () => { live = false; };
  }, [call]);

  async function act(action: () => Promise<string | void>) {
    setBusy(true); setError(''); setNotice('');
    try { const message = await action(); await reload(); if (message) setNotice(message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  }

  async function loadHistory(id: string) {
    if (openHistory === id) { setOpenHistory(null); return; }
    try { setRuns(await call<RunRecord[]>(`/workflows/${id}/runs`)); setOpenHistory(id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load run history.'); }
  }

  async function startRun(workflow: WorkflowSummary) {
    if (workflow.trigger.type === 'schedule') { void act(async () => { await call(`/workflows/${workflow.id}/run`, { method: 'POST', body: {} }); return t('wf.queued'); }); return; }
    try { const tasks = await call<TaskOption[]>('/tasks'); setRunPicker({ id: workflow.id, tasks: tasks.slice(0, 100) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load tasks.'); }
  }

  return <section className="workflows" aria-labelledby="workflows-title">
    <div className="workflows__heading"><div><p className="workspace-eyebrow">{t('wf.eyebrow')}</p><h2 id="workflows-title">{t('wf.title')}</h2><p>{t('wf.intro')}</p></div>
      {editing === null && <button type="button" className="workflows__new" onClick={() => { setError(''); setEditing('new'); }}>{t('wf.new')}</button>}</div>
    {error && <p className="productivity-error" role="alert">{error}</p>}
    {notice && <p className="automations-notice" role="status">{notice}</p>}

    {editing !== null && <WorkflowEditor key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} projects={projects} busy={busy} onCancel={() => setEditing(null)}
      onSave={(payload) => act(async () => { await (editing === 'new' ? call('/workflows', { method: 'POST', body: payload }) : call(`/workflows/${editing.id}`, { method: 'PATCH', body: payload })); setEditing(null); return t('wf.saved'); })} />}

    {workflows === null ? <p className="productivity-message">{t('wf.loading')}</p> : workflows.length === 0 && editing === null ? <p className="workflows__empty">{t('wf.empty')}</p> : <ul className="workflows__list">{workflows.map((workflow) => <li key={workflow.id}>
      <div className="workflows__row">
        <label className="workflows__switch"><input type="checkbox" checked={workflow.enabled} disabled={busy || !workflow.canManage} onChange={(event) => void act(async () => { await call(`/workflows/${workflow.id}`, { method: 'PATCH', body: { enabled: event.target.checked } }); })} /><span className="visually-hidden">{workflow.enabled ? t('wf.turnOff', { name: workflow.name }) : t('wf.turnOn', { name: workflow.name })}</span></label>
        <div className="workflows__summary"><strong>{workflow.name}</strong><small>{describeTriggerWith(t, workflow.trigger)} · {workflow.createdBy.displayName}{workflow.enabled ? '' : t('wf.off')}</small>
          {workflow.nextRunAt && workflow.enabled && <small>{t('wf.nextRun', { when: when.format(new Date(workflow.nextRunAt)) })}</small>}
          {workflow.lastRun && <small className={`workflows__last workflows__last--${workflow.lastRun.status.toLowerCase()}`}>{t('wf.lastRun', { status: statusText(workflow.lastRun.status), when: when.format(new Date(workflow.lastRun.createdAt)) })}{workflow.lastRun.error ? `—${workflow.lastRun.error}` : ''}</small>}</div>
        <div className="workflows__actions">
          <button type="button" disabled={busy} onClick={() => void startRun(workflow)}>{t('wf.runNow')}</button>
          <button type="button" aria-expanded={openHistory === workflow.id} onClick={() => void loadHistory(workflow.id)}>{t('wf.history')}</button>
          {workflow.canManage && <>
            <button type="button" disabled={busy} onClick={() => void call<WorkflowDetail>(`/workflows/${workflow.id}`).then((detail) => { setError(''); setEditing(detail); }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not open this workflow.'))}>{t('wf.edit')}</button>
            <button type="button" disabled={busy} onClick={() => { if (window.confirm(t('wf.confirmDelete', { name: workflow.name }))) void act(async () => { await call(`/workflows/${workflow.id}`, { method: 'DELETE' }); return t('wf.deleted'); }); }}>{t('wb.delete')}</button>
          </>}
        </div>
      </div>
      {runPicker?.id === workflow.id && <form className="workflows__picker" onSubmit={(event) => { event.preventDefault(); const taskId = String(new FormData(event.currentTarget).get('taskId') ?? ''); setRunPicker(null); void act(async () => { await call(`/workflows/${workflow.id}/run`, { method: 'POST', body: taskId ? { taskId } : {} }); return t('wf.queued'); }); }}>
        <label>{t('wf.pickTask')}<select name="taskId" defaultValue=""><option value="">{t('wf.noTask')}</option>{runPicker.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><button type="submit">{t('wf.run')}</button><button type="button" onClick={() => setRunPicker(null)}>{t('msg.cancel')}</button></form>}
      {openHistory === workflow.id && <div className="workflows__history" aria-label={t('wf.runHistory', { name: workflow.name })}>{runs.length === 0 ? <p>{t('wf.noRuns')}</p> : <ol>{runs.map((run) => <li key={run.id}>
        <div><span className={`workflows__badge workflows__badge--${run.status.toLowerCase()}`}>{statusText(run.status)}</span> {when.format(new Date(run.createdAt))} · {triggerKeys[String(run.trigger.type)] ? t(triggerKeys[String(run.trigger.type)]) : String(run.trigger.type).replace(/_/g, ' ')}{run.status === 'WAITING' ? t('wf.continues', { when: when.format(new Date(run.runAt)) }) : ''}{run.error && <em>—{run.error}</em>}</div>
        {run.stepRuns.length > 0 && <ul>{run.stepRuns.map((step) => <li key={step.id}><span className={`workflows__badge workflows__badge--${step.status.toLowerCase()}`}>{statusText(step.status)}</span> {stepLabelKeys[step.type as StepType] ? t(stepLabelKeys[step.type as StepType]) : step.type}{step.attempt > 1 ? t('wf.attempt', { n: step.attempt }) : ''}: {step.summary}</li>)}</ul>}
      </li>)}</ol>}</div>}
    </li>)}</ul>}
  </section>;
}

function WorkflowEditor({ initial, projects, busy, onCancel, onSave }: { initial: WorkflowDetail | null; projects: Project[]; busy: boolean; onCancel: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [trigger, setTrigger] = useState<TriggerDraft>(initial ? fromApiTrigger(initial.trigger) : emptyTrigger());
  const [steps, setSteps] = useState<StepDraft[]>(initial ? initial.steps.map(fromApiStep) : []);
  const hasTask = trigger.type !== 'schedule';
  const setT = (patch: Partial<TriggerDraft>) => setTrigger((current) => ({ ...current, ...patch }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ name, description, trigger: toApiTrigger(trigger), steps: steps.map(toApiStep), ...(initial ? {} : { enabled: false }) });
  }

  return <form className="workflow-editor" onSubmit={submit}>
    <h3>{initial ? t('wf.editTitle', { name: initial.name }) : t('wf.newTitle')}</h3>
    <label>{t('wf.name')}<input value={name} maxLength={120} required onChange={(event) => setName(event.target.value)} placeholder={t('wf.namePh')} /></label>
    <label>{t('wf.description')} <span>{t('doc.optional')}</span><input value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} /></label>
    <fieldset className="workflow-editor__trigger"><legend>{t('wf.whenHappens')}</legend>
      <label>{t('wf.trigger')}<select value={trigger.type} onChange={(event) => setT({ type: event.target.value as TriggerDraft['type'] })}><option value="task_status_changed">{t('wf.trig.statusChanged')}</option><option value="task_created">{t('wf.trig.created')}</option><option value="schedule">{t('wf.trig.schedule')}</option><option value="manual">{t('wf.trig.manual')}</option></select></label>
      {trigger.type === 'task_status_changed' && <><label>{t('wf.becomes')}<select value={trigger.toStatus} onChange={(event) => setT({ toStatus: event.target.value })}>{statuses.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
        <label>{t('wf.from')} <span>{t('doc.optional')}</span><select value={trigger.fromStatus} onChange={(event) => setT({ fromStatus: event.target.value })}><option value="">{t('au.anyStatus')}</option>{statuses.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label></>}
      {trigger.type === 'schedule' && <><label>{t('cal.repeats')}<select value={trigger.frequency} onChange={(event) => setT({ frequency: event.target.value })}><option value="DAILY">{t('wf.every.day')}</option><option value="WEEKLY">{t('wf.every.week')}</option><option value="MONTHLY">{t('wf.every.month')}</option></select></label>
        {trigger.frequency === 'WEEKLY' && <label>{t('wf.on')}<select value={trigger.weekday} onChange={(event) => setT({ weekday: event.target.value })}>{weekdayKeys.map((day, index) => <option key={day} value={index}>{cap(t(day))}</option>)}</select></label>}
        {trigger.frequency === 'MONTHLY' && <label>{t('wf.dayOfMonth')}<select value={trigger.dayOfMonth} onChange={(event) => setT({ dayOfMonth: event.target.value })}>{Array.from({ length: 28 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>}
        <label>{t('wf.at')}<input type="time" value={trigger.time} onChange={(event) => setT({ time: event.target.value })} required /></label>
        <label>{t('set.tz.title')}<input value={trigger.timeZone} onChange={(event) => setT({ timeZone: event.target.value })} required /></label>
        <p className="workflow-editor__hint">{t('wf.schedHint')}</p></>}
    </fieldset>
    <fieldset><legend>{t('wf.thenDo')}</legend>
      <StepsEditor steps={steps} onChange={setSteps} hasTask={hasTask} projects={projects} allSteps={steps} depth={0} />
      <p className="workflow-editor__hint">{t('wf.phA')} <code>{'{{task.title}}'}</code> <code>{'{{task.status}}'}</code> <code>{'{{task.priority}}'}</code> <code>{'{{task.dueDate}}'}</code> <code>{'{{now.date}}'}</code> {t('wf.phB')} <code>{'{{steps.ID.output}}'}</code>.</p>
    </fieldset>
    <div className="workflow-editor__actions"><button type="submit" disabled={busy || !name.trim() || steps.length === 0}>{busy ? t('set.saving') : t('wf.save')}</button><button type="button" onClick={onCancel}>{t('msg.cancel')}</button>{!initial && <small>{t('wf.startOff')}</small>}</div>
  </form>;
}

function StepsEditor({ steps, onChange, hasTask, projects, allSteps, depth }: { steps: StepDraft[]; onChange: (steps: StepDraft[]) => void; hasTask: boolean; projects: Project[]; allSteps: StepDraft[]; depth: number }) {
  const t = useT();
  const update = (index: number, patch: Partial<StepDraft>) => onChange(steps.map((step, position) => position === index ? { ...step, ...patch } : step));
  const move = (index: number, by: -1 | 1) => { const next = steps.slice(); const target = index + by; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange(next); };
  const types = (Object.keys(stepLabelKeys) as StepType[]).filter((type) => (hasTask || type !== 'update_task') && (depth < 3 || type !== 'branch'));
  const outputs = outputStepIds(allSteps);
  const field = (label: string, node: React.ReactNode) => <label>{label}{node}</label>;

  return <div className="workflow-steps">
    {steps.map((step, index) => <div className="workflow-step" key={step.id}>
      <div className="workflow-step__head"><strong>{index + 1}. {t(stepLabelKeys[step.type])}</strong>
        <span><button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t('wf.moveUp')}>↑</button><button type="button" onClick={() => move(index, 1)} disabled={index === steps.length - 1} aria-label={t('wf.moveDown')}>↓</button><button type="button" onClick={() => onChange(steps.filter((_, position) => position !== index))}>{t('wf.remove')}</button></span></div>
      {step.type === 'branch' && step.condition && <>
        <div className="workflow-step__row">
          {field(t('wf.if'), <select value={step.condition.field} onChange={(event) => update(index, { condition: { ...step.condition!, field: event.target.value } })}>{hasTask && taskFields.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}{outputs.filter((id) => id !== step.id).map((id) => <option key={id} value={`steps.${id}.output`}>{t('wf.resultOf', { id })}</option>)}{!hasTask && outputs.length === 0 && <option value="trigger.type">{t('wf.triggerType')}</option>}</select>)}
          {field('', <select value={step.condition.operator} onChange={(event) => update(index, { condition: { ...step.condition!, operator: event.target.value } })}>{operators.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select>)}
          {!['is_empty', 'is_not_empty'].includes(step.condition.operator) && field('', <input value={step.condition.value ?? ''} onChange={(event) => update(index, { condition: { ...step.condition!, value: event.target.value } })} placeholder={t('wf.valuePh')} />)}</div>
        <div className="workflow-step__arms"><div><p>{t('wf.ifTrue')}</p><StepsEditor steps={step.then ?? []} onChange={(then) => update(index, { then })} hasTask={hasTask} projects={projects} allSteps={allSteps} depth={depth + 1} /></div><div><p>{t('wf.otherwise')}</p><StepsEditor steps={step.else ?? []} onChange={(otherwise) => update(index, { else: otherwise })} hasTask={hasTask} projects={projects} allSteps={allSteps} depth={depth + 1} /></div></div></>}
      {step.type === 'delay' && field(t('wf.wait'), <span className="workflow-step__row"><input type="number" min={1} value={step.minutes && step.minutes % 1440 === 0 ? step.minutes / 1440 : step.minutes && step.minutes % 60 === 0 ? step.minutes / 60 : step.minutes ?? 1} onChange={(event) => { const amount = Math.max(1, Number(event.target.value) || 1); const unit = (step.minutes ?? 60) % 1440 === 0 ? 1440 : (step.minutes ?? 60) % 60 === 0 ? 60 : 1; update(index, { minutes: amount * unit }); }} />
        <select value={(step.minutes ?? 60) % 1440 === 0 ? '1440' : (step.minutes ?? 60) % 60 === 0 ? '60' : '1'} onChange={(event) => { const current = step.minutes ?? 60; const unit = current % 1440 === 0 ? 1440 : current % 60 === 0 ? 60 : 1; update(index, { minutes: Math.max(1, Math.round(current / unit)) * Number(event.target.value) }); }}><option value="1">{t('wf.minutes')}</option><option value="60">{t('wf.hours')}</option><option value="1440">{t('wf.days')}</option></select></span>)}
      {step.type === 'create_task' && <>
        {field(t('wf.taskTitle'), <input value={step.title ?? ''} maxLength={200} required onChange={(event) => update(index, { title: event.target.value })} placeholder={t('wf.followUpPh')} />)}
        {field(t('wf.notesOpt'), <textarea rows={2} value={step.description ?? ''} onChange={(event) => update(index, { description: event.target.value })} />)}
        <div className="workflow-step__row">
          {field(t('wf.priority'), <select value={step.priority ?? ''} onChange={(event) => update(index, { priority: event.target.value })}><option value="">{t('wf.default')}</option>{priorities.map(([value, label]) => <option key={value} value={value}>{cap(t(label))}</option>)}</select>)}
          {field(t('wf.dueIn'), <input type="number" min={0} max={365} value={step.dueInDays ?? ''} onChange={(event) => update(index, { dueInDays: event.target.value })} placeholder={t('wf.none')} />)}
          {field(t('wf.project'), <select value={step.project ?? ''} onChange={(event) => update(index, { project: event.target.value })}><option value="">{t('doc.noProject')}</option>{hasTask && <option value="same">{t('wf.sameProject')}</option>}{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>)}
          {field(t('wf.assignee'), <select value={step.assignee ?? ''} onChange={(event) => update(index, { assignee: event.target.value })}><option value="">{t('wf.unassigned')}</option>{hasTask && <option value="trigger">{t('wf.sameAssignee')}</option>}</select>)}</div></>}
      {step.type === 'update_task' && <div className="workflow-step__row">
        {field(t('wf.status'), <select value={step.status ?? ''} onChange={(event) => update(index, { status: event.target.value })}><option value="">{t('wf.leave')}</option>{statuses.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select>)}
        {field(t('wf.priority'), <select value={step.priority ?? ''} onChange={(event) => update(index, { priority: event.target.value })}><option value="">{t('wf.leave')}</option>{priorities.map(([value, label]) => <option key={value} value={value}>{cap(t(label))}</option>)}</select>)}
        {field(t('wf.dueIn'), <input type="number" min={0} max={365} value={step.dueInDays ?? ''} onChange={(event) => update(index, { dueInDays: event.target.value })} placeholder={t('wf.leaveShort')} />)}
        {field(t('wf.addLabels'), <input value={step.addLabels ?? ''} onChange={(event) => update(index, { addLabels: event.target.value })} placeholder="escalated, ops" />)}</div>}
      {step.type === 'notify' && <>
        {field(t('wf.notify'), <select value={step.recipients ?? 'creator'} onChange={(event) => update(index, { recipients: event.target.value })}><option value="creator">{t('wf.me')}</option>{hasTask && <option value="assignee">{t('wf.assigneeRecipient')}</option>}</select>)}
        {field(t('wf.message'), <input value={step.message ?? ''} maxLength={300} required onChange={(event) => update(index, { message: event.target.value })} placeholder={t('wf.messagePh')} />)}</>}
      {step.type === 'webhook' && <>
        {field(t('wf.address'), <input type="url" value={step.url ?? ''} maxLength={500} required onChange={(event) => update(index, { url: event.target.value })} placeholder="https://example.com/hook" />)}
        {field(t('wf.messageOpt'), <input value={step.message ?? ''} maxLength={1000} onChange={(event) => update(index, { message: event.target.value })} />)}
        <p className="workflow-editor__hint">{t('wf.webhookHint')}</p></>}
      {step.type === 'ai' && <>
        {field(t('wf.prompt'), <textarea rows={3} value={step.prompt ?? ''} maxLength={2000} required onChange={(event) => update(index, { prompt: event.target.value })} placeholder={t('wf.promptPh')} />)}
        <p className="workflow-editor__hint">{t('wf.aiHintA')} <code>{`{{steps.${step.id}.output}}`}</code> {t('wf.aiHintB')}</p></>}
    </div>)}
    <label className="workflow-steps__add"><span className="visually-hidden">{t('wf.addStep')}</span><select value="" onChange={(event) => { if (event.target.value) onChange([...steps, newStep(event.target.value as StepType)]); }}><option value="">{t('wf.addStepPh')}</option>{types.map((type) => <option key={type} value={type}>{t(stepLabelKeys[type])}</option>)}</select></label>
  </div>;
}
