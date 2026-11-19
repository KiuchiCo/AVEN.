'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { describeTrigger, emptyTrigger, fromApiStep, fromApiTrigger, newStep, outputStepIds, stepLabels, toApiStep, toApiTrigger, type RunRecord, type StepDraft, type StepType, type TriggerDraft, type WorkflowDetail, type WorkflowSummary } from './workflow-types';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const statuses = [['TODO', 'To do'], ['IN_PROGRESS', 'In progress'], ['IN_REVIEW', 'In review'], ['COMPLETED', 'Completed'], ['CANCELLED', 'Cancelled']];
const priorities = [['LOW', 'Low'], ['MEDIUM', 'Medium'], ['HIGH', 'High'], ['URGENT', 'Urgent']];
const operators = [['equals', 'is'], ['not_equals', 'is not'], ['contains', 'contains'], ['not_contains', 'does not contain'], ['is_empty', 'is empty'], ['is_not_empty', 'is not empty'], ['greater_than', 'is greater than'], ['less_than', 'is less than']];
const taskFields = [['task.status', 'Task status'], ['task.priority', 'Task priority'], ['task.title', 'Task title'], ['task.description', 'Task description'], ['task.labels', 'Task labels'], ['task.assigneeId', 'Task assignee'], ['task.daysUntilDue', 'Days until due']];
const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
type Project = { id: string; name: string };
type TaskOption = { id: string; title: string };

export function WorkflowsWorkspace() {
  const { getToken } = useAuth();
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
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API. Check your local API setup.');
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
    if (workflow.trigger.type === 'schedule') { void act(async () => { await call(`/workflows/${workflow.id}/run`, { method: 'POST', body: {} }); return 'Run queued. It starts within a few seconds.'; }); return; }
    try { const tasks = await call<TaskOption[]>('/tasks'); setRunPicker({ id: workflow.id, tasks: tasks.slice(0, 100) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load tasks.'); }
  }

  return <section className="workflows" aria-labelledby="workflows-title">
    <div className="workflows__heading"><div><p className="workspace-eyebrow">WORKFLOWS</p><h2 id="workflows-title">Automate multi-step work</h2><p>Start from a trigger, add conditions, delays, tasks, notifications, webhooks and AI steps. Workflows run as their creator, with their permissions, and keep a history of every step.</p></div>
      {editing === null && <button type="button" className="workflows__new" onClick={() => { setError(''); setEditing('new'); }}>＋ New workflow</button>}</div>
    {error && <p className="productivity-error" role="alert">{error}</p>}
    {notice && <p className="automations-notice" role="status">{notice}</p>}

    {editing !== null && <WorkflowEditor key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} projects={projects} busy={busy} onCancel={() => setEditing(null)}
      onSave={(payload) => act(async () => { await (editing === 'new' ? call('/workflows', { method: 'POST', body: payload }) : call(`/workflows/${editing.id}`, { method: 'PATCH', body: payload })); setEditing(null); return 'Workflow saved.'; })} />}

    {workflows === null ? <p className="productivity-message">Loading workflows…</p> : workflows.length === 0 && editing === null ? <p className="workflows__empty">No workflows yet. Create one to automate follow-up work, such as creating a task when another is completed.</p> : <ul className="workflows__list">{workflows.map((workflow) => <li key={workflow.id}>
      <div className="workflows__row">
        <label className="workflows__switch"><input type="checkbox" checked={workflow.enabled} disabled={busy || !workflow.canManage} onChange={(event) => void act(async () => { await call(`/workflows/${workflow.id}`, { method: 'PATCH', body: { enabled: event.target.checked } }); })} /><span className="visually-hidden">{workflow.enabled ? 'Turn off' : 'Turn on'} {workflow.name}</span></label>
        <div className="workflows__summary"><strong>{workflow.name}</strong><small>{describeTrigger(workflow.trigger)} · {workflow.createdBy.displayName}{workflow.enabled ? '' : ' · off'}</small>
          {workflow.nextRunAt && workflow.enabled && <small>Next run {when.format(new Date(workflow.nextRunAt))}</small>}
          {workflow.lastRun && <small className={`workflows__last workflows__last--${workflow.lastRun.status.toLowerCase()}`}>Last run: {workflow.lastRun.status.toLowerCase()} · {when.format(new Date(workflow.lastRun.createdAt))}{workflow.lastRun.error ? ` — ${workflow.lastRun.error}` : ''}</small>}</div>
        <div className="workflows__actions">
          <button type="button" disabled={busy} onClick={() => void startRun(workflow)}>Run now</button>
          <button type="button" aria-expanded={openHistory === workflow.id} onClick={() => void loadHistory(workflow.id)}>History</button>
          {workflow.canManage && <>
            <button type="button" disabled={busy} onClick={() => void call<WorkflowDetail>(`/workflows/${workflow.id}`).then((detail) => { setError(''); setEditing(detail); }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not open this workflow.'))}>Edit</button>
            <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Delete “${workflow.name}” and its run history?`)) void act(async () => { await call(`/workflows/${workflow.id}`, { method: 'DELETE' }); return 'Workflow deleted.'; }); }}>Delete</button>
          </>}
        </div>
      </div>
      {runPicker?.id === workflow.id && <form className="workflows__picker" onSubmit={(event) => { event.preventDefault(); const taskId = String(new FormData(event.currentTarget).get('taskId') ?? ''); setRunPicker(null); void act(async () => { await call(`/workflows/${workflow.id}/run`, { method: 'POST', body: taskId ? { taskId } : {} }); return 'Run queued. It starts within a few seconds.'; }); }}>
        <label>Run it for which task?<select name="taskId" defaultValue=""><option value="">No task (steps that need a task will fail)</option>{runPicker.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><button type="submit">Run</button><button type="button" onClick={() => setRunPicker(null)}>Cancel</button></form>}
      {openHistory === workflow.id && <div className="workflows__history" aria-label={`Run history for ${workflow.name}`}>{runs.length === 0 ? <p>No runs yet.</p> : <ol>{runs.map((run) => <li key={run.id}>
        <div><span className={`workflows__badge workflows__badge--${run.status.toLowerCase()}`}>{run.status.toLowerCase()}</span> {when.format(new Date(run.createdAt))} · {String(run.trigger.type).replace(/_/g, ' ')}{run.status === 'WAITING' ? ` · continues ${when.format(new Date(run.runAt))}` : ''}{run.error && <em> — {run.error}</em>}</div>
        {run.stepRuns.length > 0 && <ul>{run.stepRuns.map((step) => <li key={step.id}><span className={`workflows__badge workflows__badge--${step.status.toLowerCase()}`}>{step.status.toLowerCase()}</span> {stepLabels[step.type as StepType] ?? step.type}{step.attempt > 1 ? ` (attempt ${step.attempt})` : ''}: {step.summary}</li>)}</ul>}
      </li>)}</ol>}</div>}
    </li>)}</ul>}
  </section>;
}

function WorkflowEditor({ initial, projects, busy, onCancel, onSave }: { initial: WorkflowDetail | null; projects: Project[]; busy: boolean; onCancel: () => void; onSave: (payload: Record<string, unknown>) => void }) {
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
    <h3>{initial ? `Edit “${initial.name}”` : 'New workflow'}</h3>
    <label>Name<input value={name} maxLength={120} required onChange={(event) => setName(event.target.value)} placeholder="Follow up on completed tasks" /></label>
    <label>Description <span>(optional)</span><input value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} /></label>
    <fieldset className="workflow-editor__trigger"><legend>When this happens</legend>
      <label>Trigger<select value={trigger.type} onChange={(event) => setT({ type: event.target.value as TriggerDraft['type'] })}><option value="task_status_changed">A task’s status changes</option><option value="task_created">A task is created</option><option value="schedule">On a schedule</option><option value="manual">I run it by hand</option></select></label>
      {trigger.type === 'task_status_changed' && <><label>Becomes<select value={trigger.toStatus} onChange={(event) => setT({ toStatus: event.target.value })}>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>From <span>(optional)</span><select value={trigger.fromStatus} onChange={(event) => setT({ fromStatus: event.target.value })}><option value="">Any status</option>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></>}
      {trigger.type === 'schedule' && <><label>Repeats<select value={trigger.frequency} onChange={(event) => setT({ frequency: event.target.value })}><option value="DAILY">Every day</option><option value="WEEKLY">Every week</option><option value="MONTHLY">Every month</option></select></label>
        {trigger.frequency === 'WEEKLY' && <label>On<select value={trigger.weekday} onChange={(event) => setT({ weekday: event.target.value })}>{weekdayNames.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>}
        {trigger.frequency === 'MONTHLY' && <label>Day of month<select value={trigger.dayOfMonth} onChange={(event) => setT({ dayOfMonth: event.target.value })}>{Array.from({ length: 28 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>}
        <label>At<input type="time" value={trigger.time} onChange={(event) => setT({ time: event.target.value })} required /></label>
        <label>Time zone<input value={trigger.timeZone} onChange={(event) => setT({ timeZone: event.target.value })} required /></label>
        <p className="workflow-editor__hint">Scheduled workflows have no task, so they can create tasks, notify you, call webhooks and ask AI, but not update a task.</p></>}
    </fieldset>
    <fieldset><legend>Then do this</legend>
      <StepsEditor steps={steps} onChange={setSteps} hasTask={hasTask} projects={projects} allSteps={steps} depth={0} />
      <p className="workflow-editor__hint">Placeholders you can use in text: <code>{'{{task.title}}'}</code> <code>{'{{task.status}}'}</code> <code>{'{{task.priority}}'}</code> <code>{'{{task.dueDate}}'}</code> <code>{'{{now.date}}'}</code> and earlier results as <code>{'{{steps.ID.output}}'}</code>.</p>
    </fieldset>
    <div className="workflow-editor__actions"><button type="submit" disabled={busy || !name.trim() || steps.length === 0}>{busy ? 'Saving…' : 'Save workflow'}</button><button type="button" onClick={onCancel}>Cancel</button>{!initial && <small>New workflows start switched off. Turn one on from the list when you’re ready.</small>}</div>
  </form>;
}

function StepsEditor({ steps, onChange, hasTask, projects, allSteps, depth }: { steps: StepDraft[]; onChange: (steps: StepDraft[]) => void; hasTask: boolean; projects: Project[]; allSteps: StepDraft[]; depth: number }) {
  const update = (index: number, patch: Partial<StepDraft>) => onChange(steps.map((step, position) => position === index ? { ...step, ...patch } : step));
  const move = (index: number, by: -1 | 1) => { const next = steps.slice(); const target = index + by; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange(next); };
  const types = (Object.keys(stepLabels) as StepType[]).filter((type) => (hasTask || type !== 'update_task') && (depth < 3 || type !== 'branch'));
  const outputs = outputStepIds(allSteps);
  const field = (label: string, node: React.ReactNode) => <label>{label}{node}</label>;

  return <div className="workflow-steps">
    {steps.map((step, index) => <div className="workflow-step" key={step.id}>
      <div className="workflow-step__head"><strong>{index + 1}. {stepLabels[step.type]}</strong>
        <span><button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">↑</button><button type="button" onClick={() => move(index, 1)} disabled={index === steps.length - 1} aria-label="Move down">↓</button><button type="button" onClick={() => onChange(steps.filter((_, position) => position !== index))}>Remove</button></span></div>
      {step.type === 'branch' && step.condition && <>
        <div className="workflow-step__row">
          {field('If', <select value={step.condition.field} onChange={(event) => update(index, { condition: { ...step.condition!, field: event.target.value } })}>{hasTask && taskFields.map(([value, label]) => <option key={value} value={value}>{label}</option>)}{outputs.filter((id) => id !== step.id).map((id) => <option key={id} value={`steps.${id}.output`}>Result of step “{id}”</option>)}{!hasTask && outputs.length === 0 && <option value="trigger.type">Trigger type</option>}</select>)}
          {field('', <select value={step.condition.operator} onChange={(event) => update(index, { condition: { ...step.condition!, operator: event.target.value } })}>{operators.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>)}
          {!['is_empty', 'is_not_empty'].includes(step.condition.operator) && field('', <input value={step.condition.value ?? ''} onChange={(event) => update(index, { condition: { ...step.condition!, value: event.target.value } })} placeholder="value" />)}</div>
        <div className="workflow-step__arms"><div><p>If true</p><StepsEditor steps={step.then ?? []} onChange={(then) => update(index, { then })} hasTask={hasTask} projects={projects} allSteps={allSteps} depth={depth + 1} /></div><div><p>Otherwise</p><StepsEditor steps={step.else ?? []} onChange={(otherwise) => update(index, { else: otherwise })} hasTask={hasTask} projects={projects} allSteps={allSteps} depth={depth + 1} /></div></div></>}
      {step.type === 'delay' && field('Wait', <span className="workflow-step__row"><input type="number" min={1} value={step.minutes && step.minutes % 1440 === 0 ? step.minutes / 1440 : step.minutes && step.minutes % 60 === 0 ? step.minutes / 60 : step.minutes ?? 1} onChange={(event) => { const amount = Math.max(1, Number(event.target.value) || 1); const unit = (step.minutes ?? 60) % 1440 === 0 ? 1440 : (step.minutes ?? 60) % 60 === 0 ? 60 : 1; update(index, { minutes: amount * unit }); }} />
        <select value={(step.minutes ?? 60) % 1440 === 0 ? '1440' : (step.minutes ?? 60) % 60 === 0 ? '60' : '1'} onChange={(event) => { const current = step.minutes ?? 60; const unit = current % 1440 === 0 ? 1440 : current % 60 === 0 ? 60 : 1; update(index, { minutes: Math.max(1, Math.round(current / unit)) * Number(event.target.value) }); }}><option value="1">minutes</option><option value="60">hours</option><option value="1440">days</option></select></span>)}
      {step.type === 'create_task' && <>
        {field('Task title', <input value={step.title ?? ''} maxLength={200} required onChange={(event) => update(index, { title: event.target.value })} placeholder="Follow up: {{task.title}}" />)}
        {field('Notes (optional)', <textarea rows={2} value={step.description ?? ''} onChange={(event) => update(index, { description: event.target.value })} />)}
        <div className="workflow-step__row">
          {field('Priority', <select value={step.priority ?? ''} onChange={(event) => update(index, { priority: event.target.value })}><option value="">Default</option>{priorities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>)}
          {field('Due in (days)', <input type="number" min={0} max={365} value={step.dueInDays ?? ''} onChange={(event) => update(index, { dueInDays: event.target.value })} placeholder="none" />)}
          {field('Project', <select value={step.project ?? ''} onChange={(event) => update(index, { project: event.target.value })}><option value="">No project</option>{hasTask && <option value="same">Same project as the task</option>}{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>)}
          {field('Assignee', <select value={step.assignee ?? ''} onChange={(event) => update(index, { assignee: event.target.value })}><option value="">Unassigned</option>{hasTask && <option value="trigger">Same as the task</option>}</select>)}</div></>}
      {step.type === 'update_task' && <div className="workflow-step__row">
        {field('Status', <select value={step.status ?? ''} onChange={(event) => update(index, { status: event.target.value })}><option value="">Leave as is</option>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>)}
        {field('Priority', <select value={step.priority ?? ''} onChange={(event) => update(index, { priority: event.target.value })}><option value="">Leave as is</option>{priorities.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>)}
        {field('Due in (days)', <input type="number" min={0} max={365} value={step.dueInDays ?? ''} onChange={(event) => update(index, { dueInDays: event.target.value })} placeholder="leave as is" />)}
        {field('Add labels', <input value={step.addLabels ?? ''} onChange={(event) => update(index, { addLabels: event.target.value })} placeholder="escalated, ops" />)}</div>}
      {step.type === 'notify' && <>
        {field('Notify', <select value={step.recipients ?? 'creator'} onChange={(event) => update(index, { recipients: event.target.value })}><option value="creator">Me (the workflow’s owner)</option>{hasTask && <option value="assignee">The task’s assignee</option>}</select>)}
        {field('Message', <input value={step.message ?? ''} maxLength={300} required onChange={(event) => update(index, { message: event.target.value })} placeholder="{{task.title}} is done" />)}</>}
      {step.type === 'webhook' && <>
        {field('Address (https)', <input type="url" value={step.url ?? ''} maxLength={500} required onChange={(event) => update(index, { url: event.target.value })} placeholder="https://example.com/hook" />)}
        {field('Message (optional)', <input value={step.message ?? ''} maxLength={1000} onChange={(event) => update(index, { message: event.target.value })} />)}
        <p className="workflow-editor__hint">Sends the workflow, run, trigger and task details as JSON. Addresses on private networks are refused. Failed calls retry up to three times.</p></>}
      {step.type === 'ai' && <>
        {field('Prompt', <textarea rows={3} value={step.prompt ?? ''} maxLength={2000} required onChange={(event) => update(index, { prompt: event.target.value })} placeholder="Summarise the risk of {{task.title}} in two sentences." />)}
        <p className="workflow-editor__hint">The answer is available to later steps as <code>{`{{steps.${step.id}.output}}`}</code> and in conditions. It uses your workspace’s AI credits and can’t take actions by itself.</p></>}
    </div>)}
    <label className="workflow-steps__add"><span className="visually-hidden">Add a step</span><select value="" onChange={(event) => { if (event.target.value) onChange([...steps, newStep(event.target.value as StepType)]); }}><option value="">＋ Add a step…</option>{types.map((type) => <option key={type} value={type}>{stepLabels[type]}</option>)}</select></label>
  </div>;
}
