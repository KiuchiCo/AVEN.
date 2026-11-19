import { BadRequestException } from '@nestjs/common';

export const elementTypes = ['sticky', 'rect', 'ellipse', 'text', 'arrow', 'pen'] as const;
export const colors = ['ivory', 'sand', 'bronze', 'charcoal', 'green', 'blue', 'red', 'amber'] as const;
export const limits = { elements: 1000, text: 2000, points: 2000, coordinate: 100_000, size: 100_000, bytes: 1_000_000, name: 120 } as const;

export type Element = {
  id: string; type: (typeof elementTypes)[number]; x: number; y: number; w: number; h: number;
  color: (typeof colors)[number]; text?: string; points?: [number, number][];
};

const bad = (message: string): never => { throw new BadRequestException(message); };
const num = (value: unknown, label: string, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > max) return bad(`${label} must be a number within the board.`);
  return Math.round(value * 100) / 100;
};

/** Everything stored on a board passes through here, so a saved board can always be drawn. Unknown fields are dropped. */
export function parseElements(value: unknown): Element[] {
  if (!Array.isArray(value)) return bad('Elements must be a list.');
  if (value.length > limits.elements) return bad(`A whiteboard can have up to ${limits.elements} elements.`);
  const seen = new Set<string>();
  const out = value.map((raw, index): Element => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad(`Element ${index + 1} is not valid.`);
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(item.id) || seen.has(item.id)) return bad(`Element ${index + 1} needs a unique id.`);
    seen.add(item.id);
    if (!elementTypes.includes(item.type as never)) return bad(`Element ${index + 1} has an unknown type.`);
    if (!colors.includes(item.color as never)) return bad(`Element ${index + 1} has an unknown colour.`);
    const element: Element = { id: item.id, type: item.type as Element['type'], color: item.color as Element['color'], x: num(item.x, 'x', limits.coordinate), y: num(item.y, 'y', limits.coordinate), w: num(item.w, 'width', limits.size), h: num(item.h, 'height', limits.size) };
    if (item.text !== undefined) {
      if (typeof item.text !== 'string' || item.text.length > limits.text) return bad(`Text can be up to ${limits.text} characters.`);
      element.text = item.text;
    }
    if (element.type === 'pen') {
      const points = item.points;
      if (!Array.isArray(points) || points.length < 1 || points.length > limits.points) return bad(`A pen stroke needs 1 to ${limits.points} points.`);
      element.points = points.map((point) => { if (!Array.isArray(point) || point.length !== 2) return bad('Pen points must be [x, y] pairs.'); return [num(point[0], 'x', limits.coordinate), num(point[1], 'y', limits.coordinate)] as [number, number]; });
    }
    return element;
  });
  if (Buffer.byteLength(JSON.stringify(out)) > limits.bytes) bad('This whiteboard is too large to save. Remove some drawings.');
  return out;
}

export function parseName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > limits.name) return bad(`Name must be 1–${limits.name} characters.`);
  return name;
}
