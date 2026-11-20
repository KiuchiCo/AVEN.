import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, baseLength, compose, fromChange, OperationBuilder, targetLength, transform, transformPosition } from '../src/operation.ts';

function mulberry(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const random = mulberry(12345);
const rand = (n) => Math.floor(random() * n);
const letters = 'abcdef gh';
const randomText = (max = 12) => Array.from({ length: rand(max) }, () => letters[rand(letters.length)]).join('');
/** A random edit of `text`: a few inserts and deletes scattered along it. */
function randomOperation(text) {
  const builder = new OperationBuilder(); let at = 0;
  while (at < text.length) {
    const choice = rand(4);
    const run = Math.min(text.length - at, 1 + rand(3));
    if (choice === 0) builder.insert(Array.from({ length: 1 + rand(3) }, () => letters[rand(letters.length)]).join(''));
    else if (choice === 1) { builder.delete(run); at += run; }
    else { builder.retain(run); at += run; }
  }
  if (rand(3) === 0) builder.insert('!' + rand(10));
  return builder.build();
}

test('operations keep their canonical shape', () => {
  assert.deepEqual(new OperationBuilder().retain(2).retain(1).insert('a').insert('b').delete(1).delete(2).build(), [3, 'ab', -3]);
  assert.deepEqual(new OperationBuilder().delete(2).insert('x').build(), ['x', -2], 'an insert goes before a delete');
  assert.deepEqual(new OperationBuilder().retain(0).insert('').delete(0).build(), []);
  assert.equal(baseLength([3, 'ab', -3]), 6); assert.equal(targetLength([3, 'ab', -3]), 5);
});

test('apply makes the edit, and refuses text of the wrong length', () => {
  assert.equal(apply([2, 'X', -1, 2], 'hello'), 'heXlo');
  assert.equal(apply([], ''), '');
  assert.throws(() => apply([3], 'hello'), /5/);
});

test('fromChange finds the edit between two texts', () => {
  for (const [a, b] of [['hello world', 'hello brave world'], ['abc', ''], ['', 'abc'], ['same', 'same'], ['aXb', 'aYYb'], ['abcabc', 'abc']]) assert.equal(apply(fromChange(a, b), a), b);
  assert.deepEqual(fromChange('hello world', 'hello brave world'), [6, 'brave ', 5]);
});

test('transform: both orders reach the same text (random check)', () => {
  for (let round = 0; round < 2000; round += 1) {
    const text = randomText(); const a = randomOperation(text), b = randomOperation(text);
    const [a2, b2] = transform(a, b);
    assert.equal(apply(b2, apply(a, text)), apply(a2, apply(b, text)), `text=${JSON.stringify(text)} a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
    assert.equal(baseLength(b2), targetLength(a)); assert.equal(baseLength(a2), targetLength(b));
  }
});

test('transform: inserts at the same spot put the first operation’s text first, and deletes of the same text happen once', () => {
  const [a2, b2] = transform(['A', 3], ['B', 3]);
  assert.equal(apply(b2, apply(['A', 3], 'xyz')), 'ABxyz'); assert.equal(apply(a2, apply(['B', 3], 'xyz')), 'ABxyz');
  const [c2, d2] = transform([1, -1, 1], [1, -1, 1]);
  assert.equal(apply(d2, apply([1, -1, 1], 'abc')), 'ac'); assert.deepEqual(c2, [2]); assert.deepEqual(d2, [2]);
});

test('compose equals doing one edit after the other (random check)', () => {
  for (let round = 0; round < 2000; round += 1) {
    const text = randomText(); const a = randomOperation(text); const middle = apply(a, text); const b = randomOperation(middle);
    assert.equal(apply(compose(a, b), text), apply(b, middle), `text=${JSON.stringify(text)} a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
  }
  assert.throws(() => compose([3], [5]), /does not start/);
});

test('carets move with the text', () => {
  const op = [2, 'XY', -2, 3]; // "abcdefg" -> "abXYefg"
  assert.equal(transformPosition(op, 1), 1);
  assert.equal(transformPosition(op, 2), 2, 'a caret where text is inserted stays in front of it');
  assert.equal(transformPosition(op, 2, true), 4, 'unless it is the typist’s own caret');
  assert.equal(transformPosition(op, 3), 4, 'inside deleted text: just after the text that replaced it');
  assert.equal(transformPosition(op, 5), 5 + 0, 'after the edit: shifted by its net effect (0 here)');
  assert.equal(transformPosition([-3, 2], 4), 1);
});
