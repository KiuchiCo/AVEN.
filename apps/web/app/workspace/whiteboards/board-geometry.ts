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
