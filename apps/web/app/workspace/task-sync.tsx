'use client';

import { useAuth } from '@clerk/nextjs';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useT } from '../i18n';
import type { Key } from '../i18n/en';
import { useWorkspaceSession } from './workspace-shell';
import { addChange, parseProblems, parseQueue, queueKey, splitConflict, currentValue, type Problem, type QueuedChange, type TaskFields } from './task-offline';
import { apiFetch } from './connection-error';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const CHANGED = 'aven-task-sync';
const fieldKeys: Record<string, Key> = { title: 'sync.f.title', description: 'sync.f.description', status: 'sync.f.status', priority: 'sync.f.priority', labels: 'sync.f.labels', startAt: 'sync.f.startAt', dueAt: 'sync.f.dueAt', assigneeId: 'sync.f.assigneeId' };

type Result = { ok: boolean; status: number; body: { message?: string; current?: Record<string, unknown> } | null };
type Sync = {
  queue: QueuedChange[]; problems: Problem[];
  /** Bumps whenever queued edits reach the server, so a screen can reload what it shows. */
  syncVersion: number;
  /** Saves an edit now, or keeps it on this device when there is no connection. Throws with the server's message if it is refused. */
  change: (taskId: string, taskTitle: string, fields: TaskFields, base: TaskFields) => Promise<'saved' | 'queued'>;
  resolve: (problem: Problem, choice: 'mine' | 'theirs') => Promise<void>;
};
const SyncContext = createContext<Sync | null>(null);
export function useTaskSync() { const value = useContext(SyncContext); if (!value) throw new Error('useTaskSync must be used inside WorkspaceShell.'); return value; }

const subscribe = (notify: () => void) => { window.addEventListener('storage', notify); window.addEventListener(CHANGED, notify); return () => { window.removeEventListener('storage', notify); window.removeEventListener(CHANGED, notify); }; };
const read = (key: string) => { try { return window.localStorage.getItem(key) ?? ''; } catch { return ''; } };
const addProblem = (key: string, problem: Omit<Problem, 'id'>) => write(key, [...parseProblems(read(key) || null), { ...problem, id: crypto.randomUUID() }]);
const dropFromQueue = (key: string, id: string) => write(key, parseQueue(read(key) || null).filter((item) => item.id !== id));
function write(key: string, list: unknown[]): boolean {
  try { if (list.length) window.localStorage.setItem(key, JSON.stringify(list)); else window.localStorage.removeItem(key); window.dispatchEvent(new Event(CHANGED)); return true; } catch { return false; }
}

/** Keeps task edits made without a connection on this device and sends them when the connection returns. */
export function TaskSyncProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const { user, workspace } = useWorkspaceSession();
  const qKey = queueKey(user.id, workspace.id), pKey = `aven:task-problems:${user.id}:${workspace.id}`;
  const rawQueue = useSyncExternalStore(subscribe, () => read(qKey), () => '');
  const rawProblems = useSyncExternalStore(subscribe, () => read(pKey), () => '');
  const queue = useMemo(() => parseQueue(rawQueue || null), [rawQueue]);
  const problems = useMemo(() => parseProblems(rawProblems || null), [rawProblems]);
  const [version, setVersion] = useState(0);
  const flushing = useRef(false);

  /** The request never reaching the server (no connection, or no way to sign it) is `null`. */
  const patch = useCallback(async (taskId: string, body: Record<string, unknown>): Promise<Result | null> => {
    try {
      const token = await getToken();
      if (!token || !apiBase) return null;
      const response = await apiFetch(`${apiBase}/workspaces/${workspace.id}/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) };
    } catch { return null; }
  }, [getToken, workspace.id]);

  const bump = useCallback(() => setVersion((current) => current + 1), []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      let applied = false;
      for (const entry of parseQueue(read(qKey) || null)) {
        const first = await patch(entry.taskId, { ...entry.fields, base: entry.base });
        if (!first || first.status === 401) break; // still offline, or the sign-in needs refreshing: keep everything and try later
        if (first.ok) { dropFromQueue(qKey, entry.id); applied = true; continue; }
        if (first.status === 409 && first.body?.current) {
          const { clean, base, conflicting } = splitConflict(entry, first.body.current);
          if (Object.keys(clean).length) {
            const again = await patch(entry.taskId, { ...clean, base });
            if (!again) break;
            if (again.ok) applied = true;
            else conflicting.push(...Object.keys(clean));
          }
          dropFromQueue(qKey, entry.id);
          if (conflicting.length) addProblem(pKey, { taskId: entry.taskId, taskTitle: entry.taskTitle, kind: 'conflict', fields: Object.fromEntries(conflicting.map((field) => [field, entry.fields[field]])), conflicting, theirs: first.body.current, message: '' });
          continue;
        }
        dropFromQueue(qKey, entry.id);
        addProblem(pKey, { taskId: entry.taskId, taskTitle: entry.taskTitle, kind: 'rejected', fields: entry.fields, conflicting: [], theirs: null, message: first.status === 404 ? '' : first.body?.message ?? '' });
      }
      if (applied) bump();
    } finally { flushing.current = false; }
  }, [bump, patch, pKey, qKey]);

  useEffect(() => {
    if (!queue.length) return;
    void flush();
    const timer = window.setInterval(() => { void flush(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [flush, queue.length]);
  useEffect(() => { const retry = () => { void flush(); }; window.addEventListener('online', retry); return () => window.removeEventListener('online', retry); }, [flush]);

  const change = useCallback<Sync['change']>(async (taskId, taskTitle, fields, base) => {
    const result = navigator.onLine ? await patch(taskId, fields) : null;
    if (result?.ok) return 'saved';
    if (result) throw new Error(result.body?.message ?? 'Could not update the task.');
    if (!write(qKey, addChange(parseQueue(read(qKey) || null), { taskId, taskTitle, fields, base }))) throw new Error('This device could not keep the change. Try again once you are online.');
    return 'queued';
  }, [patch, qKey]);

  const resolve = useCallback<Sync['resolve']>(async (problem, choice) => {
    const remove = () => write(pKey, parseProblems(read(pKey) || null).filter((item) => item.id !== problem.id));
    if (choice === 'theirs' || problem.kind === 'rejected') { remove(); return; }
    const base = Object.fromEntries(problem.conflicting.map((field) => [field, currentValue(problem.theirs ?? {}, field) ?? null]));
    const sent = await patch(problem.taskId, { ...problem.fields, base });
    if (sent?.ok) { remove(); bump(); }
    else if (sent?.status === 409 && sent.body?.current) write(pKey, parseProblems(read(pKey) || null).map((item) => (item.id === problem.id ? { ...item, theirs: sent.body!.current! } : item)));
    else throw new Error(sent?.body?.message ?? 'Could not reach the server. Try again once you are online.');
  }, [bump, patch, pKey]);

  const value = useMemo<Sync>(() => ({ queue, problems, syncVersion: version, change, resolve }), [change, problems, queue, resolve, version]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/** Says how many edits are waiting to sync, and lets the person settle any that clashed with someone else's. */
export function TaskSyncBanner() {
  const t = useT();
  const { queue, problems, resolve } = useTaskSync();
  const names = (fields: string[]) => fields.map((field) => (fieldKeys[field] ? t(fieldKeys[field]) : field)).join(', ');
  return <>
    {queue.length > 0 && <p className="workspace-readonly-banner" role="status">{t(queue.length === 1 ? 'sync.pendingOne' : 'sync.pendingMany', { n: queue.length })}</p>}
    {problems.map((problem) => <div className="productivity-error" role="alert" key={problem.id}>
      <p>{problem.kind === 'conflict' ? t('sync.conflict', { task: problem.taskTitle, fields: names(problem.conflicting) }) : problem.message ? t('sync.rejected', { task: problem.taskTitle, message: problem.message }) : t('sync.gone', { task: problem.taskTitle })}</p>
      {problem.kind === 'conflict' ? <><button type="button" onClick={() => void resolve(problem, 'mine').catch(() => undefined)}>{t('sync.keepMine')}</button><button type="button" onClick={() => void resolve(problem, 'theirs')}>{t('sync.keepTheirs')}</button></> : <button type="button" onClick={() => void resolve(problem, 'theirs')}>{t('sync.discard')}</button>}
    </div>)}
  </>;
}
