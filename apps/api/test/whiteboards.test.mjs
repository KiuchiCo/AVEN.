import assert from 'node:assert/strict';
import { test } from 'node:test';
import { limits, parseElements, parseName } from '../dist/whiteboards/whiteboard-rules.js';

const box = (extra = {}) => ({ id: 'a1', type: 'sticky', x: 10, y: 20, w: 160, h: 120, color: 'amber', text: 'Hello', ...extra });

test('a valid board is kept, numbers are rounded and unknown fields are dropped', () => {
  const [element] = parseElements([box({ x: 1.23456, evil: '<script>' })]);
  assert.equal(element.x, 1.23); assert.equal('evil' in element, false); assert.equal(element.text, 'Hello');
});
test('rejects bad shapes, colours, ids, duplicates and numbers', () => {
  for (const bad of [{ type: 'image' }, { color: 'hotpink' }, { id: 'has space' }, { x: Infinity }, { x: 1e9 }, { w: '10' }, { text: 'x'.repeat(limits.text + 1) }]) assert.throws(() => parseElements([box(bad)]), /./);
  assert.throws(() => parseElements([box(), box()]), /unique id/);
  assert.throws(() => parseElements('nope'), /list/);
});
test('pen strokes need valid points and boards are size-limited', () => {
  assert.equal(parseElements([box({ type: 'pen', points: [[0, 0], [5, 5]] })])[0].points.length, 2);
  assert.throws(() => parseElements([box({ type: 'pen' })]), /points/);
  assert.throws(() => parseElements([box({ type: 'pen', points: [[0]] })]), /pairs/);
  assert.throws(() => parseElements(Array.from({ length: limits.elements + 1 }, (_, i) => box({ id: `e${i}` }))), /up to/);
  const heavy = Array.from({ length: 40 }, (_, i) => box({ id: `p${i}`, type: 'pen', points: Array.from({ length: limits.points }, (_, j) => [j * 7.77, j * 3.33]) }));
  assert.throws(() => parseElements(heavy), /too large/);
});
test('names are trimmed and limited', () => {
  assert.equal(parseName('  Plan  '), 'Plan');
  assert.throws(() => parseName('   '), /Name/); assert.throws(() => parseName('x'.repeat(121)), /Name/);
});

test('arrows may attach to shapes that exist; cards must point at a task, document or project', () => {
  const a = box({ id: 'a' }); const b = box({ id: 'b', type: 'rect' });
  const arrow = (extra) => ({ id: 'ar', type: 'arrow', x: 0, y: 0, w: 10, h: 10, color: 'bronze', ...extra });
  const [, , kept] = parseElements([a, b, arrow({ from: 'a', to: 'b' })]);
  assert.equal(kept.from, 'a'); assert.equal(kept.to, 'b');
  assert.throws(() => parseElements([a, arrow({ from: 'a', to: 'missing' })]), /not on the board/);
  assert.throws(() => parseElements([arrow({ from: 'ar' })]), /invalid connection/);
  assert.throws(() => parseElements([a, arrow({ from: 'ar', to: 'a' })]), /invalid connection/);
  assert.throws(() => parseElements([arrow({ from: 'ar2' }), arrow({ id: 'ar2' })]), /not on the board/, 'an arrow cannot attach to another arrow');
  const id = '11111111-1111-4111-8111-111111111111';
  const [card] = parseElements([box({ id: 'c', type: 'card', text: 'Fix login', entity: { type: 'TASK', id: id.toUpperCase() } })]);
  assert.deepEqual(card.entity, { type: 'TASK', id });
  for (const entity of [undefined, { type: 'USER', id }, { type: 'TASK', id: 'nope' }, { type: 'TASK' }]) assert.throws(() => parseElements([box({ id: 'c', type: 'card', entity })]), /task, document or project/);
});
