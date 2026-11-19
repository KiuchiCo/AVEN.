import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeMention, mentionToken, parseSegments } from '../app/workspace/messages/mention-text.ts';

const id = '11111111-1111-4111-8111-111111111111';
test('mentions are split out and everything else is kept verbatim', () => {
  assert.deepEqual(parseSegments(`hi @[Ana](${id})!`), [{ text: 'hi ' }, { mention: { id, name: 'Ana' } }, { text: '!' }]);
  assert.deepEqual(parseSegments('<b>@[x](nope)</b>'), [{ text: '<b>@[x](nope)</b>' }]);
  assert.deepEqual(parseSegments(''), []);
});
test('a token built for a name round-trips, even for odd names', () => {
  const [, segment] = parseSegments(`a ${mentionToken('Ana ] Smith', id)}`);
  assert.equal(segment.mention.id, id); assert.equal(segment.mention.name, 'Ana   Smith');
});
test('the @query before the caret is found only when it is a fresh word', () => {
  assert.deepEqual(activeMention('hello @be', 9), { start: 6, query: 'be' });
  assert.deepEqual(activeMention('@', 1), { start: 0, query: '' });
  assert.equal(activeMention('mail me@be', 10), null);
  assert.equal(activeMention('hello @be there', 15), null);
});
