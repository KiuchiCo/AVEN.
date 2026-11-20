// The maths behind the map view: reading coordinates and fitting points into a box. Kept free of React so it can be tested.

/** "-33.8688, 151.2093" (latitude, longitude) read as a place. Anything else, or anything out of range, is not a place. */
export function parseCoordinate(value: unknown): { lat: number; lng: number } | null {
  if (typeof value !== 'string') return null;
  const match = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(value); if (!match) return null;
  const lat = Number(match[1]), lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
export const worldPixel = (lat: number, lng: number, zoom: number) => {
  const scale = 256 * 2 ** zoom; const sin = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
};
/** The zoom at which every point fits inside a box (with a margin), and the world-pixel centre of those points. One point gets a street-level zoom. */
export function fitMap(points: { lat: number; lng: number }[], width: number, height: number): { zoom: number; cx: number; cy: number } {
  if (points.length === 1) { const only = worldPixel(points[0].lat, points[0].lng, 12); return { zoom: 12, cx: only.x, cy: only.y }; }
  let best = 0;
  for (let zoom = 16; zoom >= 0; zoom -= 1) {
    const pixels = points.map((point) => worldPixel(point.lat, point.lng, zoom));
    const spanX = Math.max(...pixels.map((p) => p.x)) - Math.min(...pixels.map((p) => p.x)), spanY = Math.max(...pixels.map((p) => p.y)) - Math.min(...pixels.map((p) => p.y));
    if (spanX <= width - 90 && spanY <= height - 90) { best = zoom; break; }
  }
  const pixels = points.map((point) => worldPixel(point.lat, point.lng, best));
  return { zoom: best, cx: (Math.max(...pixels.map((p) => p.x)) + Math.min(...pixels.map((p) => p.x))) / 2, cy: (Math.max(...pixels.map((p) => p.y)) + Math.min(...pixels.map((p) => p.y))) / 2 };
}
