import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hrefFor, parseFavourite } from '../dist/favourites/favourites.service.js';

const id = '11111111-1111-4111-8111-111111111111';
test('a favourite must name a known kind and a real id', () => {
  assert.deepEqual(parseFavourite({ kind: 'DOCUMENT', entityId: id.toUpperCase() }), { kind: 'DOCUMENT', entityId: id });
  for (const bad of [null, {}, { kind: 'TASK', entityId: id }, { kind: 'PROJECT', entityId: 'x' }, { kind: 'PROJECT' }, 'nope']) assert.throws(() => parseFavourite(bad), /Choose a project/);
});
test('each kind opens its own page', () => {
  assert.equal(hrefFor('PROJECT', id), `/workspace/projects/${id}`); assert.equal(hrefFor('DOCUMENT', id), `/workspace/documents/${id}`);
  assert.equal(hrefFor('WHITEBOARD', id), `/workspace/whiteboards/${id}`); assert.equal(hrefFor('DATABASE', id), '/workspace/databases');
});
