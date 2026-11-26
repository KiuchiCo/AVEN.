'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';

type Options = { intervalMs?: number; minGapMs?: number };

/**
 * Keeps a page in step with changes made elsewhere (a calendar sync, another tab, another person) without reloading the page:
 * it asks a cheap "revision" endpoint every `intervalMs` while the page is on screen, and calls `onChange` only when the answer differs from `known`.
 *
 *  - `known` is a ref the page also sets after it loads the data itself, so its own changes don't trigger a second load.
 *  - Nothing runs while the tab is hidden; coming back checks straight away (but never more often than `minGapMs`).
 *  - A check that is still running is never overlapped, and a failed check is ignored (the next one tries again).
 *  - The callbacks are read through refs, so a re-render never restarts the timer or uses an old closure.
 */
export function useLiveRevision(known: MutableRefObject<string | null>, fetchRevision: () => Promise<string>, onChange: () => Promise<void> | void, { intervalMs = 20_000, minGapMs = 5_000 }: Options = {}) {
  const fetchRef = useRef(fetchRevision); const changeRef = useRef(onChange);
  useEffect(() => { fetchRef.current = fetchRevision; changeRef.current = onChange; });

  useEffect(() => {
    let busy = false; let last = 0; let stopped = false;
    const check = async () => {
      if (busy || stopped || Date.now() - last < minGapMs) return;
      busy = true; last = Date.now();
      try {
        const next = await fetchRef.current();
        if (stopped) return;
        if (known.current === null) known.current = next;
        else if (next !== known.current) { known.current = next; await changeRef.current(); }
      } catch { /* try again at the next check */ }
      finally { busy = false; }
    };
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void check(); }, intervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [known, intervalMs, minGapMs]);
}

/**
 * Runs `task` as soon as the page is on screen, then every `intervalMs` while it stays on screen, and again when you come back to the tab.
 * Never while the tab is hidden, never twice within `minGapMs`, and never overlapping a run that hasn't finished. Used to keep a connected calendar fresh in seconds.
 */
export function usePeriodicWhileVisible(task: () => Promise<void> | void, { intervalMs = 10_000, minGapMs = 4_000 }: Options = {}) {
  const taskRef = useRef(task);
  useEffect(() => { taskRef.current = task; });
  useEffect(() => {
    let busy = false; let last = 0; let stopped = false;
    const run = async () => {
      if (busy || stopped || document.visibilityState !== 'visible' || Date.now() - last < minGapMs) return;
      busy = true; last = Date.now();
      try { await taskRef.current(); } catch { /* the next run tries again */ } finally { busy = false; }
    };
    void run();
    const timer = setInterval(() => { void run(); }, intervalMs);
    const onVisible = () => { void run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [intervalMs, minGapMs]);
}
