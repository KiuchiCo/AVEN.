/**
 * Task edits made without a connection. Each queued change says what it wants (`fields`) and what those fields were when the
 * person made the edit (`base`), so replaying it later can tell whether someone else changed the same field in the meantime.
 */
export type TaskFields = Record<string, unknown>;
export type QueuedChange = { id: string; taskId: string; taskTitle: string; fields: TaskFields; base: TaskFields; queuedAt: string };
export type Problem = { id: string; taskId: string; taskTitle: string; kind: 'conflict' | 'rejected'; fields: TaskFields; conflicting: string[]; theirs: TaskFields | null; message: string };
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type TaskLike = { assignee?: { id: string } | null; [key: string]: unknown };

export const queueKey = (userId: string, workspaceId: string) => `aven:task-queue:${userId}:${workspaceId}`;

const normalise = (field: string, value: unknown) => {
  if (field === 'dueAt' || field === 'startAt') return value ? new Date(value as string).toISOString() : null;
  if (field === 'labels') return JSON.stringify(value ?? []);
  if (field === 'description') return value || null;
  return value ?? null;
};
const same = (field: string, a: unknown, b: unknown) => normalise(field, a) === normalise(field, b);

/** The value of a task field as the API sends it back (the assignee arrives as an object). */
export const currentValue = (task: TaskLike, field: string) => (field === 'assigneeId' ? task.assignee?.id ?? null : task[field]);

/** Adds an edit, folding it into an earlier queued edit of the same task. A field put back to its original value drops out. */
export function addChange(queue: QueuedChange[], change: Omit<QueuedChange, 'id' | 'queuedAt'> & { id?: string; queuedAt?: string }): QueuedChange[] {
  const existing = queue.find((item) => item.taskId === change.taskId);
  const fields = { ...existing?.fields, ...change.fields };
  const base = { ...change.base, ...existing?.base };
  for (const field of Object.keys(fields)) if (field in base && same(field, fields[field], base[field])) { delete fields[field]; delete base[field]; }
  const rest = queue.filter((item) => item !== existing);
  if (!Object.keys(fields).length) return rest;
  return [...rest, { id: existing?.id ?? change.id ?? crypto.randomUUID(), taskId: change.taskId, taskTitle: change.taskTitle, fields, base, queuedAt: existing?.queuedAt ?? change.queuedAt ?? new Date().toISOString() }];
}

/** Fields nobody else touched can still be applied (against what is there now); the rest are conflicts for the person to settle. */
export function splitConflict(change: QueuedChange, current: TaskLike): { clean: TaskFields; base: TaskFields; conflicting: string[] } {
  const clean: TaskFields = {}, base: TaskFields = {}, conflicting: string[] = [];
  for (const field of Object.keys(change.fields)) {
    // Already holds this value (another tab of ours sent the same queued edit first): applied, not a clash.
    if (same(field, currentValue(current, field), change.fields[field])) continue;
    if (!(field in change.base) || same(field, currentValue(current, field), change.base[field])) { clean[field] = change.fields[field]; if (field in change.base) base[field] = currentValue(current, field) ?? null; }
    else conflicting.push(field);
  }
  return { clean, base, conflicting };
}

/** Task fields an offline edit can protect with a base value. */
export const baseFields = ['title', 'description', 'status', 'priority', 'labels', 'startAt', 'dueAt', 'assigneeId'];

/** What the changed fields look like on this task now, for use as the `base` of an edit. */
export function baseFor(task: TaskLike, fields: TaskFields): TaskFields {
  return Object.fromEntries(Object.keys(fields).filter((field) => baseFields.includes(field)).map((field) => [field, currentValue(task, field) ?? null]));
}

export function parseQueue(raw: string | null): QueuedChange[] {
  try {
    const value = JSON.parse(raw ?? '[]') as unknown;
    return Array.isArray(value) ? value.filter((item): item is QueuedChange => Boolean(item) && typeof item.id === 'string' && typeof item.taskId === 'string' && typeof item.taskTitle === 'string' && typeof item.queuedAt === 'string' && typeof item.fields === 'object' && item.fields !== null && typeof item.base === 'object' && item.base !== null) : [];
  } catch { return []; }
}

export function parseProblems(raw: string | null): Problem[] {
  try {
    const value = JSON.parse(raw ?? '[]') as unknown;
    return Array.isArray(value) ? value.filter((item): item is Problem => Boolean(item) && typeof item.id === 'string' && typeof item.taskId === 'string' && typeof item.taskTitle === 'string' && (item.kind === 'conflict' || item.kind === 'rejected') && typeof item.message === 'string' && typeof item.fields === 'object' && item.fields !== null && Array.isArray(item.conflicting)) : [];
  } catch { return []; }
}

export function readQueue(store: Store, key: string): QueuedChange[] {
  try { return parseQueue(store.getItem(key)); } catch { return []; }
}

/** False when the browser refuses (storage full or blocked); the edit is then not kept, and the caller should say so. */
export function writeQueue(store: Store, key: string, queue: QueuedChange[]): boolean {
  try { if (queue.length) store.setItem(key, JSON.stringify(queue)); else store.removeItem(key); return true; } catch { return false; }
}
