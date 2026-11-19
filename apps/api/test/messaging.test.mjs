import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChannelEvents } from '../dist/messaging/channel-events.js';
import { parseBefore, parseChannelName, parseMessageBody, parseTopic } from '../dist/messaging/message-rules.js';

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
test('events reach only subscribers of that workspace, stop after unsubscribe, and a failing listener is isolated', () => {
  const events = new ChannelEvents(); const a = []; const b = [];
  const off = events.subscribe('w1', (e) => a.push(e)); events.subscribe('w1', () => { throw new Error('broken'); }); events.subscribe('w2', (e) => b.push(e));
  events.publish('w1', { type: 'message_deleted', channelId: 'c', id: 'm' });
  assert.equal(a.length, 1); assert.equal(b.length, 0);
  off(); events.publish('w1', { type: 'message_deleted', channelId: 'c', id: 'm2' }); assert.equal(a.length, 1);
});
