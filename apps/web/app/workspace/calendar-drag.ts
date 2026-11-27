'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { pixelsToMinutes } from './calendar-moves';

/** Where an event was dropped: a day (`data-cal-date`), and in the day view an hour (`data-cal-hour`). */
export type DropTarget = { dateKey: string; hour: number | null };
type Drag = { eventId: string; title: string; x: number; y: number; over: DropTarget | null };
type Resize = { eventId: string; minutes: number };

const MOUSE_THRESHOLD = 5;     // pixels a mouse moves before a press becomes a drag
const TOUCH_HOLD_MS = 350;     // how long a finger rests before a drag starts, so a swipe still scrolls
const TOUCH_SLOP = 8;          // a finger that moves further than this before the hold is scrolling

function targetAt(x: number, y: number): DropTarget | null {
  const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cal-date]');
  if (!cell?.dataset.calDate) return null;
  return { dateKey: cell.dataset.calDate, hour: cell.dataset.calHour === undefined ? null : Number(cell.dataset.calHour) };
}

/**
 * Pointer-based moving and resizing for the calendar, so a mouse and a finger work the same way (HTML drag and drop does not work on
 * iPhone and is unreliable with touch). A mouse drags after a few pixels; a finger after a short hold, so ordinary swipes keep scrolling.
 * Keyboard and screen-reader users change times in the event dialog instead.
 */
export function useCalendarDrag({ onMove, onResize }: { onMove: (eventId: string, target: DropTarget) => void; onResize: (eventId: string, minutes: number) => void }) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [resize, setResize] = useState<Resize | null>(null);
  const suppressClick = useRef(false);
  const cleanup = useRef<() => void>(() => undefined);
  useEffect(() => () => cleanup.current(), []);

  /** Props for an event chip that can be moved. */
  const moveHandle = (eventId: string, title: string) => ({
    'data-cal-event': eventId,
    onPointerDown: (down: ReactPointerEvent<HTMLElement>) => {
      if (down.button !== 0) return;
      const touch = down.pointerType !== 'mouse';
      const start = { x: down.clientX, y: down.clientY };
      let active = false; let current: Drag | null = null;
      const begin = (x: number, y: number) => { active = true; current = { eventId, title, x, y, over: targetAt(x, y) }; setDrag(current); };
      const hold = touch ? window.setTimeout(() => begin(start.x, start.y), TOUCH_HOLD_MS) : 0;
      const move = (event: PointerEvent) => {
        const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
        if (!active) {
          if (touch) { if (distance > TOUCH_SLOP) stop(); return; }
          if (distance < MOUSE_THRESHOLD) return;
          begin(event.clientX, event.clientY);
        }
        current = { eventId, title, x: event.clientX, y: event.clientY, over: targetAt(event.clientX, event.clientY) }; setDrag(current);
      };
      // While a finger drags an event the page must not scroll underneath it.
      const blockScroll = (event: TouchEvent) => { if (active) event.preventDefault(); };
      const up = () => { const finished = active ? current : null; stop(); if (finished) { suppressClick.current = true; window.setTimeout(() => { suppressClick.current = false; }, 0); if (finished.over) onMove(eventId, finished.over); } };
      const cancel = () => stop();
      const keys = (event: KeyboardEvent) => { if (event.key === 'Escape') stop(); };
      function stop() {
        window.clearTimeout(hold); setDrag(null);
        document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', cancel);
        document.removeEventListener('touchmove', blockScroll); document.removeEventListener('keydown', keys);
        cleanup.current = () => undefined;
      }
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', cancel);
      document.addEventListener('touchmove', blockScroll, { passive: false }); document.addEventListener('keydown', keys);
      cleanup.current = stop;
    },
    // A drag ends with a click on what it started on; that click must not also open the event or select the day.
    onClickCapture: (event: { stopPropagation: () => void; preventDefault: () => void }) => { if (suppressClick.current) { event.stopPropagation(); event.preventDefault(); } },
  });

  /** Props for the bottom edge of an event in the day view: drag it up or down to change how long the event lasts. */
  const resizeHandle = (eventId: string, hourHeight: () => number) => ({
    onPointerDown: (down: ReactPointerEvent<HTMLElement>) => {
      if (down.button !== 0) return;
      down.stopPropagation(); down.preventDefault();
      const startY = down.clientY; let minutes = 0;
      setResize({ eventId, minutes: 0 });
      const move = (event: PointerEvent) => { minutes = pixelsToMinutes(event.clientY - startY, hourHeight()); setResize({ eventId, minutes }); };
      const up = () => { stop(); if (minutes !== 0) onResize(eventId, minutes); };
      const keys = (event: KeyboardEvent) => { if (event.key === 'Escape') { minutes = 0; stop(); } };
      function stop() { setResize(null); document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', stop); document.removeEventListener('keydown', keys); cleanup.current = () => undefined; }
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', stop); document.addEventListener('keydown', keys);
      cleanup.current = stop;
    },
  });

  return { drag, resize, moveHandle, resizeHandle };
}
