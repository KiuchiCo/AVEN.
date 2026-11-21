import { isIP } from 'node:net';
import { BadRequestException } from '@nestjs/common';
import { zonedToUtc } from '../productivity/ics.js';

// ---- shapes ---------------------------------------------------------------------------------------------------

const statuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED'] as const;
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const operators = ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty', 'greater_than', 'less_than'] as const;
export type Operator = (typeof operators)[number];
export type Condition = { field: string; operator: Operator; value?: string };

export type Trigger =
  | { type: 'task_status_changed'; toStatus: (typeof statuses)[number]; fromStatus?: (typeof statuses)[number] }
  | { type: 'task_created' }
  | { type: 'manual' }
  | { type: 'schedule'; frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'; time: string; timeZone: string; weekday?: number; dayOfMonth?: number };

export type Step =
  | { id: string; type: 'branch'; condition: Condition; then: Step[]; else: Step[] }
  | { id: string; type: 'delay'; minutes: number }
  | { id: string; type: 'create_task'; title: string; description?: string; priority?: (typeof priorities)[number]; dueInDays?: number; project?: string; assignee?: string }
  | { id: string; type: 'update_task'; status?: (typeof statuses)[number]; priority?: (typeof priorities)[number]; dueInDays?: number; addLabels?: string[] }
  | { id: string; type: 'notify'; message: string; recipients: 'creator' | 'assignee' }
  | { id: string; type: 'webhook'; url: string; message?: string }
  | { id: string; type: 'ai'; prompt: string };

export type PathSegment = number | 'then' | 'else';
export type Path = PathSegment[];

export const limits = { steps: 30, depth: 3, delayMinutes: 43_200, name: 120, description: 500, text: 2000 } as const;
const idPattern = /^[a-z][a-z0-9_-]{0,31}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const taskFields = ['task.title', 'task.description', 'task.status', 'task.priority', 'task.labels', 'task.assigneeId', 'task.projectId', 'task.dueAt', 'task.daysUntilDue'] as const;
const bad = (message: string): never => { throw new BadRequestException(message); };

// ---- validation -----------------------------------------------------------------------------------------------

function parseTrigger(value: unknown): Trigger {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad('Choose what starts this workflow.');
  const t = value as Record<string, unknown>;
  switch (t.type) {
    case 'task_status_changed': {
      if (!statuses.includes(t.toStatus as never)) return bad('Choose the status that starts this workflow.');
      if (t.fromStatus !== undefined && t.fromStatus !== null && t.fromStatus !== '' && !statuses.includes(t.fromStatus as never)) return bad('The starting status is not valid.');
      return { type: 'task_status_changed', toStatus: t.toStatus as never, ...(t.fromStatus ? { fromStatus: t.fromStatus as never } : {}) };
    }
    case 'task_created': return { type: 'task_created' };
    case 'manual': return { type: 'manual' };
    case 'schedule': {
      if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(t.frequency as string)) return bad('Choose daily, weekly or monthly.');
      if (typeof t.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.time)) return bad('Time must look like 09:30.');
      if (typeof t.timeZone !== 'string' || t.timeZone.length > 80 || !zonedToUtc(0, t.timeZone)) return bad('Choose a valid time zone.');
      const out: Trigger = { type: 'schedule', frequency: t.frequency as 'DAILY', time: t.time, timeZone: t.timeZone };
      if (t.frequency === 'WEEKLY') { if (!Number.isInteger(t.weekday) || (t.weekday as number) < 0 || (t.weekday as number) > 6) return bad('Choose a day of the week.'); out.weekday = t.weekday as number; }
      if (t.frequency === 'MONTHLY') { if (!Number.isInteger(t.dayOfMonth) || (t.dayOfMonth as number) < 1 || (t.dayOfMonth as number) > 28) return bad('Choose a day of the month from 1 to 28.'); out.dayOfMonth = t.dayOfMonth as number; }
      return out;
    }
    default: return bad('Choose what starts this workflow.');
  }
}

/** Is a webhook address acceptable on its face? The address it resolves to is checked again when it is called. */
export function checkWebhookUrl(raw: string, allowPrivate = false): URL {
  let url: URL;
  try { url = new URL(raw); } catch { return bad('Enter a full webhook address, like https://example.com/hook.'); }
  if (raw.length > 500) return bad('Webhook addresses can be up to 500 characters.');
  if (url.username || url.password) return bad('Webhook addresses cannot contain a username or password.');
  if (!allowPrivate) {
    if (url.protocol !== 'https:') return bad('Webhooks must use https.');
    const host = url.hostname.replace(/^\[|\]$/g, '').toLocaleLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return bad('Webhooks can’t point to internal addresses.');
    if (isIP(host) && !isPublicAddress(host)) return bad('Webhooks can’t point to internal addresses.');
  } else if (url.protocol !== 'https:' && url.protocol !== 'http:') return bad('Webhooks must use http or https.');
  return url;
}

type Ctx = { count: number; ids: Set<string>; hasTask: boolean; allowPrivate: boolean };

function parseCondition(value: unknown, ctx: Ctx, allIds: Set<string>): Condition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad('Each branch needs a condition.');
  const c = value as Record<string, unknown>;
  const field = typeof c.field === 'string' ? c.field : '';
  const stepOutput = /^steps\.([a-z][a-z0-9_-]{0,31})\.output$/.exec(field);
  if (stepOutput ? !allIds.has(stepOutput[1]) : !(taskFields as readonly string[]).includes(field) && field !== 'trigger.type') return bad('Choose a field to check.');
  if (field.startsWith('task.') && !ctx.hasTask) return bad('This trigger has no task, so conditions can’t check task fields.');
  if (!operators.includes(c.operator as never)) return bad('Choose how to compare.');
  const needsValue = !['is_empty', 'is_not_empty'].includes(c.operator as string);
  if (needsValue && (typeof c.value !== 'string' || c.value.length > 200)) return bad('Enter a value to compare with (up to 200 characters).');
  if (['greater_than', 'less_than'].includes(c.operator as string) && Number.isNaN(Number(c.value))) return bad('Greater than and less than need a number.');
  return { field, operator: c.operator as Operator, ...(needsValue ? { value: c.value as string } : {}) };
}

function parseSteps(value: unknown, ctx: Ctx, allIds: Set<string>, depth: number): Step[] {
  if (!Array.isArray(value)) return bad('Steps must be a list.');
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('A step is not valid.');
    const s = raw as Record<string, unknown>;
    if (typeof s.id !== 'string' || !idPattern.test(s.id)) return bad('Each step needs a short id of lowercase letters, numbers, - or _.');
    if (ctx.ids.has(s.id)) return bad(`Step id “${s.id}” is used twice.`);
    ctx.ids.add(s.id);
    if (++ctx.count > limits.steps) return bad(`A workflow can have up to ${limits.steps} steps.`);
    const text = (key: string, min: number, max: number, label: string): string => { const v = typeof s[key] === 'string' ? (s[key] as string).trim() : ''; if (v.length < min || v.length > max) return bad(`${label} must be ${min === 0 ? 'up to' : `${min}–`} ${max} characters.`); return v; };
    const optionalText = (key: string, max: number, label: string): string | undefined => { if (s[key] === undefined || s[key] === null || s[key] === '') return undefined; return text(key, 1, max, label); };
    const needTask = (what: string) => { if (!ctx.hasTask) bad(`${what} needs a task, but this trigger doesn’t provide one.`); };
    const id = s.id;
    switch (s.type) {
      case 'branch': {
        if (depth >= limits.depth) return bad(`Branches can be nested ${limits.depth} levels deep.`);
        return { id, type: 'branch', condition: parseCondition(s.condition, ctx, allIds), then: parseSteps(s.then ?? [], ctx, allIds, depth + 1), else: parseSteps(s.else ?? [], ctx, allIds, depth + 1) };
      }
      case 'delay': {
        if (!Number.isInteger(s.minutes) || (s.minutes as number) < 1 || (s.minutes as number) > limits.delayMinutes) return bad('Wait between 1 minute and 30 days.');
        return { id, type: 'delay', minutes: s.minutes as number };
      }
      case 'create_task': {
        const step: Step = { id, type: 'create_task', title: text('title', 1, 200, 'Task title') };
        const description = optionalText('description', 5000, 'Task description'); if (description) step.description = description;
        if (s.priority !== undefined && s.priority !== '') { if (!priorities.includes(s.priority as never)) return bad('Priority is not valid.'); step.priority = s.priority as never; }
        if (s.dueInDays !== undefined && s.dueInDays !== null && s.dueInDays !== '') { if (!Number.isInteger(s.dueInDays) || (s.dueInDays as number) < 0 || (s.dueInDays as number) > 365) return bad('Due in days must be 0–365.'); step.dueInDays = s.dueInDays as number; }
        if (s.project !== undefined && s.project !== '') { if (s.project !== 'same' && s.project !== 'none' && !(typeof s.project === 'string' && uuid.test(s.project))) return bad('Choose a project.'); if (s.project === 'same') needTask('Using the same project'); step.project = s.project as string; }
        if (s.assignee !== undefined && s.assignee !== '') { if (s.assignee !== 'trigger' && s.assignee !== 'none' && !(typeof s.assignee === 'string' && uuid.test(s.assignee))) return bad('Choose an assignee.'); if (s.assignee === 'trigger') needTask('Using the same assignee'); step.assignee = s.assignee as string; }
        return step;
      }
      case 'update_task': {
        needTask('Updating a task');
        const step: Step = { id, type: 'update_task' };
        if (s.status !== undefined && s.status !== '') { if (!statuses.includes(s.status as never)) return bad('Status is not valid.'); step.status = s.status as never; }
        if (s.priority !== undefined && s.priority !== '') { if (!priorities.includes(s.priority as never)) return bad('Priority is not valid.'); step.priority = s.priority as never; }
        if (s.dueInDays !== undefined && s.dueInDays !== null && s.dueInDays !== '') { if (!Number.isInteger(s.dueInDays) || (s.dueInDays as number) < 0 || (s.dueInDays as number) > 365) return bad('Due in days must be 0–365.'); step.dueInDays = s.dueInDays as number; }
        if (s.addLabels !== undefined) { if (!Array.isArray(s.addLabels) || s.addLabels.length > 10 || s.addLabels.some((l) => typeof l !== 'string' || !/^[\p{L}\p{N}_-]{1,32}$/u.test(l.toLocaleLowerCase()))) return bad('Labels must be 1–32 letters, numbers, underscores or hyphens (up to 10).'); step.addLabels = [...new Set((s.addLabels as string[]).map((l) => l.toLocaleLowerCase()))]; }
        if (step.status === undefined && step.priority === undefined && step.dueInDays === undefined && !step.addLabels?.length) return bad('Choose at least one change for the task.');
        return step;
      }
      case 'notify': {
        if (s.recipients !== 'creator' && s.recipients !== 'assignee') return bad('Choose who to notify.');
        if (s.recipients === 'assignee') needTask('Notifying the assignee');
        return { id, type: 'notify', message: text('message', 1, 300, 'Message'), recipients: s.recipients };
      }
      case 'webhook': {
        const url = checkWebhookUrl(text('url', 1, 500, 'Webhook address'), ctx.allowPrivate).toString();
        const message = optionalText('message', 1000, 'Message');
        return { id, type: 'webhook', url, ...(message ? { message } : {}) };
      }
      case 'ai': return { id, type: 'ai', prompt: text('prompt', 1, limits.text, 'Prompt') };
      default: return bad('Choose a valid step type.');
    }
  });
}

function collectIds(steps: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(steps)) for (const step of steps) if (step && typeof step === 'object') { const s = step as Record<string, unknown>; if (typeof s.id === 'string') into.add(s.id); collectIds(s.then, into); collectIds(s.else, into); }
  return into;
}

export type WorkflowInput = { name: string; description: string; trigger: Trigger; steps: Step[]; enabled?: boolean };

/** Validates a whole workflow. Nothing from the request is trusted: every field is checked and rebuilt. */
export function parseWorkflow(body: unknown, options: { allowPrivateWebhooks?: boolean } = {}): WorkflowInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('A JSON object is required.');
  const input = body as Record<string, unknown>;
  const unknown = Object.keys(input).find((key) => !['name', 'description', 'trigger', 'steps', 'enabled'].includes(key));
  if (unknown) return bad(`Unknown field “${unknown}”.`);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > limits.name) return bad(`Name must be 1–${limits.name} characters.`);
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length > limits.description) return bad(`Description can be up to ${limits.description} characters.`);
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') return bad('Enabled must be true or false.');
  const trigger = parseTrigger(input.trigger);
  const ctx: Ctx = { count: 0, ids: new Set(), hasTask: trigger.type !== 'schedule', allowPrivate: options.allowPrivateWebhooks === true };
  const steps = parseSteps(input.steps, ctx, collectIds(input.steps), 0);
  if (!steps.length) return bad('Add at least one step.');
  return { name, description, trigger, steps, ...(input.enabled !== undefined ? { enabled: input.enabled as boolean } : {}) };
}

// ---- walking the step tree ------------------------------------------------------------------------------------

const listAt = (steps: Step[], path: Path): Step[] => {
  let list = steps;
  for (let i = 0; i < path.length - 1; i += 2) { const step = list[path[i] as number]; list = (step as Extract<Step, { type: 'branch' }>)[path[i + 1] as 'then' | 'else']; }
  return list;
};

export const stepAt = (steps: Step[], path: Path): Step | undefined => listAt(steps, path)[path.at(-1) as number];

/** The path of the step after the one at `path`. For a branch, `arm` says which side was chosen. Null when the workflow is done. */
export function nextPath(steps: Step[], path: Path, arm?: 'then' | 'else'): Path | null {
  const current = stepAt(steps, path);
  if (current?.type === 'branch' && arm && current[arm].length) return [...path, arm, 0];
  let at = [...path];
  for (;;) {
    const index = at.at(-1) as number;
    if (index + 1 < listAt(steps, at).length) return [...at.slice(0, -1), index + 1];
    if (at.length === 1) return null;
    at = at.slice(0, -2);
  }
}

// ---- conditions and templates ---------------------------------------------------------------------------------

export type Vars = { task: { title: string; description: string; status: string; priority: string; labels: string[]; assigneeId: string | null; projectId: string | null; dueAt: string | null } | null; trigger: { type: string }; steps: Record<string, { output: string }>; workflow: { name: string }; now: Date };
type Value = string | number | string[] | null;

export function lookup(vars: Vars, field: string): Value {
  const task = vars.task;
  switch (field) {
    case 'task.title': return task?.title ?? null;
    case 'task.description': return task?.description ?? null;
    case 'task.status': return task?.status ?? null;
    case 'task.priority': return task?.priority ?? null;
    case 'task.labels': return task?.labels ?? null;
    case 'task.assigneeId': return task?.assigneeId ?? null;
    case 'task.projectId': return task?.projectId ?? null;
    case 'task.dueAt': return task?.dueAt ?? null;
    case 'task.dueDate': return task?.dueAt ? task.dueAt.slice(0, 10) : null;
    case 'task.daysUntilDue': return task?.dueAt ? Math.floor((new Date(task.dueAt).getTime() - vars.now.getTime()) / 86_400_000) : null;
    case 'trigger.type': return vars.trigger.type;
    case 'workflow.name': return vars.workflow.name;
    case 'now.date': return vars.now.toISOString().slice(0, 10);
    default: { const match = /^steps\.([a-z][a-z0-9_-]{0,31})\.output$/.exec(field); return match ? vars.steps[match[1]]?.output ?? null : null; }
  }
}

const isEmpty = (value: Value) => value === null || value === '' || (Array.isArray(value) && value.length === 0);

export function evaluateCondition(condition: Condition, vars: Vars): boolean {
  const left = lookup(vars, condition.field);
  const right = condition.value ?? '';
  const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
  switch (condition.operator) {
    case 'is_empty': return isEmpty(left);
    case 'is_not_empty': return !isEmpty(left);
    case 'equals': return Array.isArray(left) ? left.some((item) => same(item, right)) : left !== null && same(String(left), right);
    case 'not_equals': return Array.isArray(left) ? !left.some((item) => same(item, right)) : left === null || !same(String(left), right);
    case 'contains': return Array.isArray(left) ? left.some((item) => same(item, right)) : left !== null && String(left).toLocaleLowerCase().includes(right.toLocaleLowerCase());
    case 'not_contains': return Array.isArray(left) ? !left.some((item) => same(item, right)) : left === null || !String(left).toLocaleLowerCase().includes(right.toLocaleLowerCase());
    case 'greater_than': case 'less_than': {
      const number = typeof left === 'number' ? left : typeof left === 'string' && left.trim() !== '' ? Number(left) : NaN;
      if (Number.isNaN(number)) return false;
      return condition.operator === 'greater_than' ? number > Number(right) : number < Number(right);
    }
  }
}

/** Fills {{placeholders}}. Unknown or empty values become empty text, and the result is capped. */
export function render(template: string, vars: Vars, max = 5000): string {
  const out = template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, field: string) => { const value = lookup(vars, field); return value === null ? '' : Array.isArray(value) ? value.join(', ') : String(value); });
  return out.length > max ? out.slice(0, max) : out;
}

// ---- schedules and retries ------------------------------------------------------------------------------------

/** The next time a schedule fires, strictly after `after`. */
export function nextScheduledRun(schedule: Extract<Trigger, { type: 'schedule' }>, after: Date): Date {
  const [hour, minute] = schedule.time.split(':').map(Number);
  const local = new Intl.DateTimeFormat('en-US', { timeZone: schedule.timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(after);
  const part = (type: string) => Number(local.find((item) => item.type === type)?.value);
  for (let offset = 0; offset < 800; offset += 1) {
    const day = new Date(Date.UTC(part('year'), part('month') - 1, part('day') + offset));
    const matches = schedule.frequency === 'DAILY' || (schedule.frequency === 'WEEKLY' && day.getUTCDay() === schedule.weekday) || (schedule.frequency === 'MONTHLY' && day.getUTCDate() === schedule.dayOfMonth);
    if (!matches) continue;
    const at = zonedToUtc(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute), schedule.timeZone);
    if (at && at > after) return at;
  }
  throw new Error('Could not work out the next run time.');
}

export const MAX_ATTEMPTS = 3;
const backoff = [30_000, 120_000, 600_000];

/** How long to wait before retrying after `failedAttempts` failures, or null to give up. */
export function retryDelay(failedAttempts: number): number | null {
  return failedAttempts >= MAX_ATTEMPTS ? null : backoff[Math.max(0, failedAttempts - 1)];
}

// ---- webhook address safety -----------------------------------------------------------------------------------

/** The eight 16-bit groups of an IPv6 address, with `::` and a trailing dotted IPv4 part expanded; null if it is not one. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLocaleLowerCase().replace(/%.*$/, '');
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (v4) { const [a, b, c, d] = v4.slice(1).map(Number); if ([a, b, c, d].some((part) => part > 255)) return null; text = `${text.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`; }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : []; const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array<string>(fill).fill('0'), ...tail].map((group) => parseInt(group, 16));
  return groups.length === 8 && groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? groups : null;
}

/** True only for addresses on the public internet. Private, loopback, link-local, metadata and reserved ranges are refused. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (family === 6) {
    const groups = ipv6Groups(address);
    if (!groups) return false;
    const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
    const embedded = (hi: number, lo: number) => isPublicAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    if (groups.every((group) => group === 0) || (groups.slice(0, 7).every((group) => group === 0) && g7 === 1)) return false; // :: and ::1
    if ([g0, g1, g2, g3, g4].every((group) => group === 0) && g5 === 0xffff) return embedded(g6, g7); // ::ffff:a.b.c.d, however it is written
    if ([g0, g1, g2, g3, g4, g5].every((group) => group === 0)) return embedded(g6, g7); // ::a.b.c.d (IPv4-compatible)
    if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return embedded(g6, g7); // NAT64: the address after the prefix is what is reached
    if (g0 === 0x64 && g1 === 0xff9b) return false; // the local-use NAT64 range
    if (g0 === 0x2002) return embedded(g1, g2); // 6to4 carries an IPv4 address in the next 32 bits
    if (g0 === 0x2001 && g1 === 0) return false; // Teredo
    if (g0 === 0x2001 && g1 === 0xdb8) return false; // documentation
    if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return false; // discard-only
    if ((g0 & 0xfe00) === 0xfc00 || (g0 & 0xffc0) === 0xfe80 || (g0 & 0xffc0) === 0xfec0 || (g0 & 0xff00) === 0xff00) return false; // unique-local, link-local, site-local, multicast
    return true;
  }
  return false;
}
