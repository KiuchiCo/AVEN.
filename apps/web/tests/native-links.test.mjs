import assert from 'node:assert/strict';
import test from 'node:test';
import { deviceClass, routeForLink } from '../app/mobile/native.ts';

const origin = 'https://app.aven.test';
const id = '123e4567-e89b-42d3-a456-426614174000';

test('deep links open only AVEN. screens', () => {
  assert.equal(routeForLink('aven://inbox', origin), '/workspace/inbox');
  assert.equal(routeForLink('aven://open', origin), '/workspace');
  assert.equal(routeForLink(`aven://tasks/${id}`, origin), `/workspace/tasks/${id}`);
  assert.equal(routeForLink('/workspace/calendar', origin), '/workspace/calendar');
  assert.equal(routeForLink(`${origin}/workspace/documents/${id}`, origin), `/workspace/documents/${id}`);
});

test('anything else is refused: other sites, schemes, paths, ids and traversal', () => {
  for (const bad of ['https://evil.test/workspace/inbox', 'javascript:alert(1)', 'aven://evil', 'aven://tasks/not-an-id', '/admin', '/workspace/inbox/' + id, '/workspace/../admin', 'aven://tasks/../../x', 'file:///etc/passwd']) assert.equal(routeForLink(bad, origin), null, bad);
});

test('iPad and iPhone are told apart by width, and desktops (no touch) are neither', () => {
  assert.equal(deviceClass(820, 5), 'ipad'); assert.equal(deviceClass(390, 5), 'iphone'); assert.equal(deviceClass(1440, 0), 'other');
});
