import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachArrows } from '../app/workspace/whiteboards/board-geometry.ts';
import { buildTemplate as build, templateOptions } from '../app/workspace/whiteboards/board-templates.ts';

const buildTemplate = (key) => build(key, attachArrows);

test('every template builds valid, unique elements with arrows attached to real shapes', () => {
  for (const { key } of templateOptions) {
    const elements = buildTemplate(key);
    assert.equal(new Set(elements.map((e) => e.id)).size, elements.length, `${key}: ids are unique`);
    const shapes = new Set(elements.filter((e) => e.type !== 'arrow').map((e) => e.id));
    for (const arrow of elements.filter((e) => e.type === 'arrow')) {
      assert.ok(shapes.has(arrow.from) && shapes.has(arrow.to), `${key}: arrow ends are on shapes`);
      assert.ok(Math.hypot(arrow.w, arrow.h) > 10, `${key}: arrows have length`);
    }
    assert.ok(elements.length <= 1000);
  }
  assert.deepEqual(buildTemplate('blank'), []); assert.ok(buildTemplate('mindmap').length >= 9);
});
