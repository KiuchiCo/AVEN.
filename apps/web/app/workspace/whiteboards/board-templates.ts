import type { BoardElement, Color } from './board-types';

const uid = () => Math.random().toString(36).slice(2, 12);

export type TemplateKey = 'blank' | 'mindmap' | 'flowchart' | 'retro';
export const templateOptions: { key: TemplateKey; label: string; hint: string }[] = [
  { key: 'blank', label: 'Blank', hint: 'An empty canvas' },
  { key: 'mindmap', label: 'Mind map', hint: 'A central idea with branches' },
  { key: 'flowchart', label: 'Flowchart', hint: 'Start, steps, a decision and an end' },
  { key: 'retro', label: 'Retrospective', hint: 'Went well, to improve, actions' },
];

const shape = (type: BoardElement['type'], x: number, y: number, w: number, h: number, text: string, color: Color): BoardElement => ({ id: uid(), type, x, y, w, h, color, text });
const link = (from: BoardElement, to: BoardElement, color: Color = 'bronze'): BoardElement => ({ id: uid(), type: 'arrow', x: 0, y: 0, w: 1, h: 1, color, from: from.id, to: to.id });

/** Starting points for a new board. Arrows are attached, so they follow the shapes when moved. */
/** `attachArrows` is passed in (from board-geometry) so this file has no imports of its own to resolve. */
export function buildTemplate(key: TemplateKey, attachArrows: (elements: BoardElement[]) => BoardElement[]): BoardElement[] {
  if (key === 'mindmap') {
    const centre = shape('ellipse', 320, 200, 220, 110, 'Central idea', 'bronze');
    const branches = [shape('sticky', 40, 40, 180, 100, 'Branch one', 'amber'), shape('sticky', 640, 40, 180, 100, 'Branch two', 'green'), shape('sticky', 40, 380, 180, 100, 'Branch three', 'blue'), shape('sticky', 640, 380, 180, 100, 'Branch four', 'red')];
    return attachArrows([centre, ...branches, ...branches.map((branch) => link(centre, branch))]);
  }
  if (key === 'flowchart') {
    const start = shape('ellipse', 40, 200, 150, 80, 'Start', 'green');
    const step = shape('rect', 260, 195, 170, 90, 'Do the work', 'ivory');
    const decide = shape('rect', 500, 195, 170, 90, 'Done?', 'amber');
    const end = shape('ellipse', 740, 200, 150, 80, 'End', 'red');
    const retry = shape('rect', 500, 360, 170, 70, 'Fix and retry', 'ivory');
    return attachArrows([start, step, decide, end, retry, link(start, step), link(step, decide), link(decide, end), link(decide, retry), link(retry, step)]);
  }
  if (key === 'retro') {
    const columns: [string, Color][] = [['Went well', 'green'], ['To improve', 'amber'], ['Actions', 'blue']];
    return columns.flatMap(([title, color], index) => [shape('text', 40 + index * 300, 30, 260, 50, title, 'charcoal'), shape('sticky', 40 + index * 300, 100, 260, 120, '', color)]);
  }
  return [];
}
