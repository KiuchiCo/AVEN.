import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeBox, toWorld, zoomAt, maxZoom, minZoom } from '../app/workspace/whiteboards/board-geometry.ts';

test('zooming keeps the point under the cursor fixed', () => {
  const view = { x: 40, y: 30, k: 1 };
  const before = toWorld(view, 300, 200);
  const next = zoomAt(view, 300, 200, 1.5);
  const after = toWorld(next, 300, 200);
  assert.ok(Math.abs(before[0] - after[0]) < 1e-9 && Math.abs(before[1] - after[1]) < 1e-9);
});
test('zoom is limited', () => {
  assert.equal(zoomAt({ x: 0, y: 0, k: 1 }, 0, 0, 100).k, maxZoom);
  assert.equal(zoomAt({ x: 0, y: 0, k: 1 }, 0, 0, 0.001).k, minZoom);
});
test('normalizeBox turns a signed vector into a positive box', () => {
  assert.deepEqual(normalizeBox({ x: 100, y: 100, w: -40, h: -10 }), { x: 60, y: 90, w: 40, h: 10 });
});

import { attachArrows, edgePoint } from '../app/workspace/whiteboards/board-geometry.ts';

const rect = (id, x, y, w = 100, h = 60, type = 'rect') => ({ id, type, x, y, w, h });
test('an attached arrow runs between the outlines of its two shapes', () => {
  const [, , arrow] = attachArrows([rect('a', 0, 0), rect('b', 300, 0), { id: 'ar', type: 'arrow', x: 0, y: 0, w: 1, h: 1, from: 'a', to: 'b' }]);
  assert.deepEqual([arrow.x, arrow.y, arrow.w, arrow.h], [100, 30, 200, 0]);
});
test('moving a shape moves the arrow end with it; an unchanged board returns the same list', () => {
  const board = [rect('a', 0, 0), rect('b', 300, 0), { id: 'ar', type: 'arrow', x: 0, y: 0, w: 1, h: 1, from: 'a', to: 'b' }];
  const settled = attachArrows(board);
  assert.equal(attachArrows(settled), settled);
  const moved = attachArrows(settled.map((e) => (e.id === 'b' ? { ...e, y: 200 } : e)));
  assert.notEqual(moved[2].h, 0); assert.ok(moved[2].y + moved[2].h > 100);
});
test('an arrow whose shape is gone is detached and keeps its place; one end can stay free', () => {
  const [arrow] = attachArrows([{ id: 'ar', type: 'arrow', x: 10, y: 10, w: 50, h: 50, from: 'gone' }]);
  assert.equal('from' in arrow, false); assert.deepEqual([arrow.x, arrow.y, arrow.w, arrow.h], [10, 10, 50, 50]);
  const [, half] = attachArrows([rect('a', 0, 0), { id: 'ar', type: 'arrow', x: 0, y: 0, w: 200, h: 0, from: 'a' }]);
  assert.equal(half.x, 100); assert.equal(half.x + half.w, 200, 'the free end does not move');
});
test('edge points land on rectangles and ellipses', () => {
  assert.deepEqual(edgePoint(rect('a', 0, 0), [300, 30]), [100, 30]);
  const [x, y] = edgePoint(rect('o', 0, 0, 200, 100, 'ellipse'), [100, 1000]);
  assert.ok(Math.abs(x - 100) < 1 && Math.abs(y - 100) < 1);
});
