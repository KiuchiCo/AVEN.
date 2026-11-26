import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveRevision } from '../app/workspace/use-live-revision';

/** Lets the pending promises settle after a timer fires. */
const settle = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const setVisibility = (state: 'visible' | 'hidden') => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state }); document.dispatchEvent(new Event('visibilitychange')); };

describe('useLiveRevision', () => {
  beforeEach(() => { vi.useFakeTimers(); setVisibility('visible'); });
  afterEach(() => { vi.useRealTimers(); setVisibility('visible'); });

  it('asks once per interval, learns the first answer silently, and reloads only when the revision changes', async () => {
    const known = { current: null as string | null };
    const answers = ['1-10', '1-10', '2-20', '2-20'];
    const fetchRevision = vi.fn(async () => answers.shift() ?? '2-20');
    const onChange = vi.fn(async () => undefined);
    renderHook(() => useLiveRevision(known, fetchRevision, onChange, { intervalMs: 20_000, minGapMs: 1000 }));
    expect(fetchRevision).not.toHaveBeenCalled();
    for (let i = 0; i < 4; i += 1) { await act(async () => { vi.advanceTimersByTime(20_000); }); await settle(); }
    expect(fetchRevision).toHaveBeenCalledTimes(4);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(known.current).toBe('2-20');
  });

  it('does not reload for the page’s own changes: when the page records the new revision itself', async () => {
    const known = { current: '1-10' as string | null };
    const onChange = vi.fn(async () => undefined);
    renderHook(() => useLiveRevision(known, async () => '2-20', onChange, { intervalMs: 20_000 }));
    known.current = '2-20'; // the page loaded after its own edit and remembered the revision
    await act(async () => { vi.advanceTimersByTime(20_000); }); await settle();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing while the tab is hidden, and checks straight away when it comes back (but not twice in a row)', async () => {
    const known = { current: '1-10' as string | null };
    const fetchRevision = vi.fn(async () => '2-20'); const onChange = vi.fn(async () => undefined);
    renderHook(() => useLiveRevision(known, fetchRevision, onChange, { intervalMs: 20_000, minGapMs: 5_000 }));
    setVisibility('hidden');
    await act(async () => { vi.advanceTimersByTime(60_000); }); await settle();
    expect(fetchRevision).not.toHaveBeenCalled();
    setVisibility('visible'); await settle();
    expect(fetchRevision).toHaveBeenCalledTimes(1); expect(onChange).toHaveBeenCalledTimes(1);
    setVisibility('visible'); setVisibility('visible'); await settle();
    expect(fetchRevision).toHaveBeenCalledTimes(1);
  });

  it('never overlaps a slow check, ignores a failed one, and stops when the page goes away', async () => {
    const known = { current: '1-10' as string | null };
    let release: (value: string) => void = () => undefined;
    const fetchRevision = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));
    const onChange = vi.fn(async () => undefined);
    const { unmount } = renderHook(() => useLiveRevision(known, fetchRevision, onChange, { intervalMs: 1_000, minGapMs: 0 }));
    await act(async () => { vi.advanceTimersByTime(5_000); }); await settle();
    expect(fetchRevision).toHaveBeenCalledTimes(1);
    await act(async () => { release('1-10'); }); await settle();
    fetchRevision.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { vi.advanceTimersByTime(1_000); }); await settle();
    expect(onChange).not.toHaveBeenCalled();
    unmount();
    const calls = fetchRevision.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(10_000); }); await settle();
    expect(fetchRevision.mock.calls.length).toBe(calls);
  });
});
