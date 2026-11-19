export type View = { x: number; y: number; k: number };
export const minZoom = 0.2; export const maxZoom = 3;

export const toWorld = (view: View, sx: number, sy: number): [number, number] => [(sx - view.x) / view.k, (sy - view.y) / view.k];

/** Zooms by `factor` keeping the world point under (sx, sy) where it is on screen. */
export function zoomAt(view: View, sx: number, sy: number, factor: number): View {
  const k = Math.min(maxZoom, Math.max(minZoom, view.k * factor));
  const [wx, wy] = toWorld(view, sx, sy);
  return { k, x: sx - wx * k, y: sy - wy * k };
}

/** Box-like elements store a positive size; arrows keep a signed vector from their start. */
export function normalizeBox<T extends { x: number; y: number; w: number; h: number }>(element: T): T {
  return { ...element, x: element.w < 0 ? element.x + element.w : element.x, y: element.h < 0 ? element.y + element.h : element.y, w: Math.abs(element.w), h: Math.abs(element.h) };
}

export const clampSize = (value: number, min = 24) => Math.max(min, value);

type Box = { id: string; type: string; x: number; y: number; w: number; h: number };
type Connectable = Box & { from?: string; to?: string };
const isShape = (element: Box) => element.type !== 'arrow' && element.type !== 'pen';
const centre = (box: Box): [number, number] => [box.x + box.w / 2, box.y + box.h / 2];

/** Where the line from a shape's centre towards `target` leaves the shape's outline. */
export function edgePoint(box: Box, target: [number, number]): [number, number] {
  const [cx, cy] = centre(box); const dx = target[0] - cx; const dy = target[1] - cy;
  const hw = Math.max(box.w / 2, 1); const hh = Math.max(box.h / 2, 1);
  if (dx === 0 && dy === 0) return [cx, cy];
  const scale = box.type === 'ellipse' ? 1 / Math.hypot(dx / hw, dy / hh) : Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
  return [cx + dx * scale, cy + dy * scale];
}

/**
 * Keeps attached arrows on their shapes: each attached end sits on the shape's outline, facing the other end.
 * An arrow whose shape has been deleted is detached and stays where it was. Returns the same list when nothing changes.
 */
export function attachArrows<T extends Connectable>(elements: T[]): T[] {
  const shapes = new Map(elements.filter(isShape).map((element) => [element.id, element]));
  let changed = false;
  const next = elements.map((element) => {
    if (element.type !== 'arrow' || (!element.from && !element.to)) return element;
    const from = element.from ? shapes.get(element.from) : undefined; const to = element.to ? shapes.get(element.to) : undefined;
    const draft: Connectable = { ...element };
    if (element.from && !from) delete draft.from;
    if (element.to && !to) delete draft.to;
    let start: [number, number] = [element.x, element.y]; let end: [number, number] = [element.x + element.w, element.y + element.h];
    if (from && to) { start = edgePoint(from, centre(to)); end = edgePoint(to, centre(from)); }
    else if (from) start = edgePoint(from, end);
    else if (to) end = edgePoint(to, start);
    const round = (value: number) => Math.round(value * 100) / 100;
    draft.x = round(start[0]); draft.y = round(start[1]); draft.w = round(end[0] - start[0]); draft.h = round(end[1] - start[1]);
    const same = draft.x === element.x && draft.y === element.y && draft.w === element.w && draft.h === element.h && draft.from === element.from && draft.to === element.to;
    if (same) return element;
    changed = true; return draft as T;
  });
  return changed ? next : elements;
}
