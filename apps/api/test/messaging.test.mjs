import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChannelEvents } from '../dist/messaging/channel-events.js';
import { directKey, extractMentionIds, parseBefore, parseChannelName, parseMessageBody, parseParentId, parseParticipants, parseSearchQuery, parseTopic } from '../dist/messaging/message-rules.js';

test('channel names are normalised or refused', () => {
  assert.equal(parseChannelName('  Design Team '), 'design-team'); assert.equal(parseChannelName('#general'), 'general'); assert.equal(parseChannelName('q3_plan'), 'q3-plan');
  for (const bad of ['', '-x', 'a'.repeat(41), 'héllo', 'a/b', 5, null]) assert.throws(() => parseChannelName(bad), /Channel names/);
});
test('messages are trimmed, non-empty and limited; topics are optional', () => {
  assert.equal(parseMessageBody('  hi\r\nthere '), 'hi\nthere');
  assert.throws(() => parseMessageBody('   '), /Write something/); assert.throws(() => parseMessageBody('x'.repeat(4001)), /4000/); assert.throws(() => parseMessageBody(7), /Write something/);
  assert.equal(parseTopic(undefined), ''); assert.equal(parseTopic(' Launch '), 'Launch'); assert.throws(() => parseTopic('x'.repeat(201)), /topic/);
});
test('before must be a date when given', () => {
  assert.equal(parseBefore(undefined), null); assert.ok(parseBefore('2026-01-01T00:00:00Z') instanceof Date); assert.throws(() => parseBefore('soon'), /date/);
});
test('events reach only the right workspace and audience, stop after unsubscribe, and a failing listener is isolated', () => {
  const events = new ChannelEvents(); const a = []; const b = []; const c = [];
  const off = events.subscribe('w1', 'ann', (e) => a.push(e)); events.subscribe('w1', 'bob', () => { throw new Error('broken'); }); events.subscribe('w2', 'cy', (e) => b.push(e)); events.subscribe('w1', 'dee', (e) => c.push(e));
  const presenceA = a.length;
  events.publish('w1', { type: 'message_deleted', channelId: 'c', id: 'm' });
  assert.equal(a.length, presenceA + 1); assert.equal(b.filter((e) => e.type !== 'presence').length, 0);
  events.publish('w1', { type: 'message_deleted', channelId: 'c', id: 'private' }, ['ann', 'bob']);
  assert.ok(a.some((e) => e.id === 'private')); assert.equal(c.some((e) => e.id === 'private'), false, 'someone outside the audience heard a private event');
  off(); const before = a.length; events.publish('w1', { type: 'message_deleted', channelId: 'c', id: 'm2' }); assert.equal(a.length, before);
});
test('presence follows connections: online on the first, offline after the last', () => {
  const events = new ChannelEvents(); const seen = [];
  events.subscribe('w', 'watcher', (e) => { if (e.type === 'presence') seen.push(e.online.slice().sort()); });
  const one = events.subscribe('w', 'ann', () => undefined); const two = events.subscribe('w', 'ann', () => undefined);
  assert.deepEqual(events.online('w').sort(), ['ann', 'watcher']);
  one(); assert.ok(events.online('w').includes('ann'), 'still online through the second connection');
  two(); assert.deepEqual(events.online('w'), ['watcher']); assert.deepEqual(seen.at(-1), ['watcher']);
});
test('conversation rules: participants, direct keys, parents and search terms', () => {
  const a = '11111111-1111-4111-8111-111111111111'; const b = '22222222-2222-4222-8222-222222222222'; const c = '33333333-3333-4333-8333-333333333333';
  assert.deepEqual(parseParticipants([b, b.toUpperCase(), a], a), [b]);
  assert.throws(() => parseParticipants([a], a), /at least one/); assert.throws(() => parseParticipants('x', a), /Choose/); assert.throws(() => parseParticipants(['nope'], a), /Choose/);
  assert.throws(() => parseParticipants(Array.from({ length: 8 }, (_, i) => `${String(i + 4).padStart(8, '0')}-1111-4111-8111-111111111111`), a), /up to 8/);
  assert.equal(directKey(a, b), directKey(b, a)); assert.notEqual(directKey(a, b), directKey(a, c));
  assert.equal(parseParentId(undefined), null); assert.equal(parseParentId(b), b); assert.throws(() => parseParentId('x'), /not valid/);
  assert.equal(parseSearchQuery('  plan '), 'plan'); assert.throws(() => parseSearchQuery('a'), /Search/); assert.throws(() => parseSearchQuery(undefined), /Search/);
});
test('mentions are read by id, de-duplicated, and malformed ones are ignored', () => {
  const a = '11111111-1111-4111-8111-111111111111'; const b = '22222222-2222-4222-8222-222222222222';
  assert.deepEqual(extractMentionIds(`hi @[Ana](${a}) and @[Ben Q](${b}) and again @[Ana](${a.toUpperCase()})`), [a, b]);
  assert.deepEqual(extractMentionIds('@[Ana](not-an-id) @Ana @[](x) plain text'), []);
  assert.equal(extractMentionIds(Array.from({ length: 30 }, (_, i) => `@[U](${String(i).padStart(8, '0')}-1111-4111-8111-111111111111)`).join(' ')).length, 20);
});

test('one person can hold only a limited number of live connections, and releasing frees a slot', () => {
  const events = new ChannelEvents();
  const held = Array.from({ length: 5 }, () => events.acquire('u1'));
  assert.ok(held.every(Boolean)); assert.equal(events.acquire('u1'), null); assert.ok(events.acquire('u2'), 'another person is unaffected');
  held[0](); held[0](); // releasing twice must not free two slots
  assert.ok(events.acquire('u1')); assert.equal(events.acquire('u1'), null);
});
