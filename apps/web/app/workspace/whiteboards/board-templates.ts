import type { BoardElement, Color } from './board-types';

const uid = () => Math.random().toString(36).slice(2, 12);

export type TemplateKey = 'blank' | 'mindmap' | 'flowchart' | 'brainstorm' | 'journey' | 'retro';
export const templateOptions: { key: TemplateKey; label: string; hint: string }[] = [
  { key: 'blank', label: 'Blank', hint: 'An empty canvas' },
  { key: 'mindmap', label: 'Mind map', hint: 'A central idea with branches' },
  { key: 'flowchart', label: 'Flowchart', hint: 'Start, steps, a decision and an end' },
  { key: 'brainstorm', label: 'Brainstorm', hint: 'A question with sticky notes around it' },
  { key: 'journey', label: 'User journey', hint: 'Five stages from discovery to loyalty' },
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
  if (key === 'brainstorm') {
    const question = shape('ellipse', 330, 190, 240, 120, 'What are we solving?', 'bronze');
    const notes = [shape('sticky', 40, 40, 170, 100, 'Idea', 'amber'), shape('sticky', 690, 40, 170, 100, 'Idea', 'green'), shape('sticky', 40, 360, 170, 100, 'Idea', 'blue'), shape('sticky', 690, 360, 170, 100, 'Idea', 'amber'), shape('sticky', 365, 380, 170, 100, 'Risk', 'red')];
    return attachArrows([question, ...notes, ...notes.map((note) => link(question, note))]);
  }
  if (key === 'journey') {
    const stages: [string, Color][] = [['Discover', 'blue'], ['Try', 'green'], ['Adopt', 'amber'], ['Share', 'bronze'], ['Stay', 'ivory']];
    const boxes = stages.map(([title, color], index) => shape('rect', 40 + index * 210, 160, 170, 90, title, color));
    const notes = boxes.map((box) => shape('sticky', box.x, 290, 170, 110, 'What happens here?', 'amber'));
    return attachArrows([...boxes, ...notes, ...boxes.slice(1).map((box, index) => link(boxes[index], box))]);
  }
  if (key === 'retro') {
    const columns: [string, Color][] = [['Went well', 'green'], ['To improve', 'amber'], ['Actions', 'blue']];
    return columns.flatMap(([title, color], index) => [shape('text', 40 + index * 300, 30, 260, 50, title, 'charcoal'), shape('sticky', 40 + index * 300, 100, 260, 120, '', color)]);
  }
  return [];
}
