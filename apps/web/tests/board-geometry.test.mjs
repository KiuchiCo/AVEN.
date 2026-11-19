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
