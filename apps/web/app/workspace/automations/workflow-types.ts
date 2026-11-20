import type { Key } from '../../i18n/en';

export type StepType = 'branch' | 'delay' | 'create_task' | 'update_task' | 'notify' | 'webhook' | 'ai';

/** The editor's working copy of a step. Fields are loose strings so inputs can be empty while typing. */
export type StepDraft = {
  id: string; type: StepType;
  condition?: { field: string; operator: string; value?: string }; then?: StepDraft[]; else?: StepDraft[];
  minutes?: number;
  title?: string; description?: string; priority?: string; dueInDays?: string; project?: string; assignee?: string;
  status?: string; addLabels?: string;
  message?: string; recipients?: string; url?: string; prompt?: string;
};

export type TriggerDraft = { type: 'task_status_changed' | 'task_created' | 'manual' | 'schedule'; toStatus: string; fromStatus: string; frequency: string; time: string; timeZone: string; weekday: string; dayOfMonth: string };

export type WorkflowSummary = { id: string; name: string; description: string; enabled: boolean; trigger: Record<string, unknown>; nextRunAt: string | null; canManage: boolean; createdBy: { displayName: string }; lastRun: { status: string; createdAt: string; error: string | null } | null };
export type WorkflowDetail = { id: string; name: string; description: string; enabled: boolean; trigger: Record<string, unknown>; steps: Record<string, unknown>[] };
export type StepRunRecord = { id: string; stepId: string; type: string; status: string; attempt: number; summary: string; startedAt: string };
export type RunRecord = { id: string; status: string; trigger: Record<string, unknown>; runAt: string; createdAt: string; finishedAt: string | null; error: string | null; stepRuns: StepRunRecord[] };

export const stepLabels: Record<StepType, string> = {
  branch: 'If / otherwise', delay: 'Wait', create_task: 'Create a task', update_task: 'Update the task', notify: 'Send a notification', webhook: 'Call a webhook', ai: 'Ask AI',
};

let counter = 0;
export const newStepId = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`.slice(0, 32);
export const newStep = (type: StepType): StepDraft => ({
  id: newStepId(), type,
  ...(type === 'branch' ? { condition: { field: 'task.priority', operator: 'equals', value: 'HIGH' }, then: [], else: [] } : {}),
  ...(type === 'delay' ? { minutes: 60 } : {}),
  ...(type === 'notify' ? { recipients: 'creator', message: '' } : {}),
});

export const emptyTrigger = (): TriggerDraft => ({ type: 'task_status_changed', toStatus: 'COMPLETED', fromStatus: '', frequency: 'DAILY', time: '09:00', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', weekday: '1', dayOfMonth: '1' });

/** Editor draft → the shape the API validates. Empty optional fields are left out. */
export function toApiStep(step: StepDraft): Record<string, unknown> {
  const out: Record<string, unknown> = { id: step.id, type: step.type };
  const put = (key: string, value: unknown) => { if (value !== undefined && value !== '' && value !== null) out[key] = value; };
  switch (step.type) {
    case 'branch': return { ...out, condition: step.condition?.operator === 'is_empty' || step.condition?.operator === 'is_not_empty' ? { field: step.condition.field, operator: step.condition.operator } : step.condition, then: (step.then ?? []).map(toApiStep), else: (step.else ?? []).map(toApiStep) };
    case 'delay': return { ...out, minutes: Number(step.minutes) };
    case 'create_task': put('title', step.title); put('description', step.description); put('priority', step.priority); put('dueInDays', step.dueInDays === undefined || step.dueInDays === '' ? undefined : Number(step.dueInDays)); put('project', step.project); put('assignee', step.assignee); return out;
    case 'update_task': put('status', step.status); put('priority', step.priority); put('dueInDays', step.dueInDays === undefined || step.dueInDays === '' ? undefined : Number(step.dueInDays)); if (step.addLabels?.trim()) out.addLabels = step.addLabels.split(',').map((label) => label.trim()).filter(Boolean); return out;
    case 'notify': return { ...out, message: step.message ?? '', recipients: step.recipients ?? 'creator' };
    case 'webhook': put('url', step.url); put('message', step.message); return out;
    case 'ai': return { ...out, prompt: step.prompt ?? '' };
  }
}

export function fromApiStep(raw: Record<string, unknown>): StepDraft {
  const step = raw as unknown as StepDraft & { addLabels?: string[]; dueInDays?: number };
  return {
    ...step,
    dueInDays: step.dueInDays === undefined ? undefined : String(step.dueInDays),
    addLabels: Array.isArray(step.addLabels) ? step.addLabels.join(', ') : undefined,
    then: step.then?.map((child) => fromApiStep(child as unknown as Record<string, unknown>)),
    else: step.else?.map((child) => fromApiStep(child as unknown as Record<string, unknown>)),
  };
}

export function toApiTrigger(trigger: TriggerDraft): Record<string, unknown> {
  if (trigger.type === 'task_status_changed') return { type: trigger.type, toStatus: trigger.toStatus, ...(trigger.fromStatus ? { fromStatus: trigger.fromStatus } : {}) };
  if (trigger.type === 'schedule') return { type: 'schedule', frequency: trigger.frequency, time: trigger.time, timeZone: trigger.timeZone, ...(trigger.frequency === 'WEEKLY' ? { weekday: Number(trigger.weekday) } : {}), ...(trigger.frequency === 'MONTHLY' ? { dayOfMonth: Number(trigger.dayOfMonth) } : {}) };
  return { type: trigger.type };
}

export function fromApiTrigger(raw: Record<string, unknown>): TriggerDraft {
  return { ...emptyTrigger(), type: raw.type as TriggerDraft['type'], toStatus: String(raw.toStatus ?? 'COMPLETED'), fromStatus: String(raw.fromStatus ?? ''), frequency: String(raw.frequency ?? 'DAILY'), time: String(raw.time ?? '09:00'), timeZone: String(raw.timeZone ?? emptyTrigger().timeZone), weekday: String(raw.weekday ?? '1'), dayOfMonth: String(raw.dayOfMonth ?? '1') };
}

const statusWords: Record<string, string> = { TODO: 'to do', IN_PROGRESS: 'in progress', IN_REVIEW: 'in review', COMPLETED: 'completed', CANCELLED: 'cancelled' };
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function describeTrigger(trigger: Record<string, unknown>): string {
  switch (trigger.type) {
    case 'task_status_changed': return `When a task becomes ${statusWords[String(trigger.toStatus)] ?? trigger.toStatus}${trigger.fromStatus ? ` (from ${statusWords[String(trigger.fromStatus)]})` : ''}`;
    case 'task_created': return 'When a task is created';
    case 'manual': return 'Run by hand';
    case 'schedule': return `${trigger.frequency === 'DAILY' ? 'Every day' : trigger.frequency === 'WEEKLY' ? `Every ${weekdays[Number(trigger.weekday)]}` : `Monthly on day ${trigger.dayOfMonth}`} at ${trigger.time} (${trigger.timeZone})`;
    default: return 'Unknown trigger';
  }
}

/** Step ids whose result a later step can use as {{steps.<id>.output}}. */
export function outputStepIds(steps: StepDraft[]): string[] {
  return steps.flatMap((step) => [...(['ai', 'webhook', 'create_task', 'update_task'].includes(step.type) ? [step.id] : []), ...outputStepIds(step.then ?? []), ...outputStepIds(step.else ?? [])]);
}

export const stepLabelKeys: Record<StepType, Key> = {
  branch: 'wf.step.branch', delay: 'wf.step.delay', create_task: 'wf.step.create_task', update_task: 'wf.step.update_task', notify: 'wf.step.notify', webhook: 'wf.step.webhook', ai: 'wf.step.ai',
};
const statusKeys: Record<string, Key> = { TODO: 'status.todo', IN_PROGRESS: 'status.inProgress', IN_REVIEW: 'status.inReview', COMPLETED: 'status.completed', CANCELLED: 'status.cancelled' };

/** Same text as describeTrigger, in the person's language. */
export function describeTriggerWith(t: (key: Key, values?: Record<string, string | number>) => string, trigger: Record<string, unknown>): string {
  const status = (value: unknown) => (statusKeys[String(value)] ? t(statusKeys[String(value)]).toLocaleLowerCase() : String(value));
  switch (trigger.type) {
    case 'task_status_changed': return t('wf.d.statusChanged', { to: status(trigger.toStatus), from: trigger.fromStatus ? t('wf.d.from', { status: status(trigger.fromStatus) }) : '' });
    case 'task_created': return t('wf.d.created');
    case 'manual': return t('wf.d.manual');
    case 'schedule': {
      const when = trigger.frequency === 'DAILY' ? t('wf.d.everyDay') : trigger.frequency === 'WEEKLY' ? t('wf.d.everyWeekday', { day: t(`wd.${Number(trigger.weekday)}` as Key).toLocaleLowerCase() }) : t('wf.d.monthly', { n: String(trigger.dayOfMonth) });
      return t('wf.d.schedule', { when, time: String(trigger.time), zone: String(trigger.timeZone) });
    }
    default: return t('wf.d.unknown');
  }
}
