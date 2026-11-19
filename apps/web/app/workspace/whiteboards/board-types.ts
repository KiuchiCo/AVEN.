export type Tool = 'select' | 'sticky' | 'rect' | 'ellipse' | 'text' | 'arrow' | 'pen' | 'card';
export type EntityType = 'TASK' | 'DOCUMENT' | 'PROJECT';
export type Color = 'ivory' | 'sand' | 'bronze' | 'charcoal' | 'green' | 'blue' | 'red' | 'amber';
export type BoardElement = { id: string; type: Exclude<Tool, 'select'>; x: number; y: number; w: number; h: number; color: Color; text?: string; points?: [number, number][]; from?: string; to?: string; entity?: { type: EntityType; id: string } };
export type BoardSummary = { id: string; name: string; updatedAt: string; createdBy: { displayName: string } };
export type BoardDetail = BoardSummary & { content: { elements: BoardElement[] } };

export const palette: Record<Color, { fill: string; line: string }> = {
  ivory: { fill: '#fbf7ee', line: '#a89d8a' }, sand: { fill: '#eadfce', line: '#9c8466' }, bronze: { fill: '#d9bf9a', line: '#7d5f3c' }, charcoal: { fill: '#555049', line: '#2b2a27' },
  green: { fill: '#cfe3d5', line: '#34765a' }, blue: { fill: '#cddcec', line: '#567ba8' }, red: { fill: '#efcfcf', line: '#b95353' }, amber: { fill: '#f6e2a8', line: '#c18a42' },
};
export const colorNames = Object.keys(palette) as Color[];
export const uid = () => Math.random().toString(36).slice(2, 12);

/** Default size of each box-like element when it is first placed. */
export const defaults: Record<'sticky' | 'rect' | 'ellipse' | 'text' | 'card', { w: number; h: number }> = { sticky: { w: 180, h: 140 }, rect: { w: 200, h: 120 }, ellipse: { w: 200, h: 120 }, text: { w: 220, h: 48 }, card: { w: 220, h: 80 } };
