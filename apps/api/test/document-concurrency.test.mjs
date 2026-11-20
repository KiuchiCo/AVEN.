import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { documentConflict, parseBaseUpdatedAt } from '../dist/productivity/document-concurrency.js';
import { AllExceptionsFilter } from '../dist/common/all-exceptions.filter.js';

test('baseUpdatedAt is required and must be a real date', () => {
  for (const value of [undefined, null, '', 'yesterday', 12345, {}]) assert.throws(() => parseBaseUpdatedAt(value), BadRequestException);
});

test('baseUpdatedAt keeps millisecond precision so it matches the stored timestamp exactly', () => {
  const stored = new Date('2026-11-19T05:30:12.345Z');
  assert.equal(parseBaseUpdatedAt(stored.toISOString()).getTime(), stored.getTime());
});

test('a conflict is a 409 that carries the current document through the error filter', () => {
  const current = { id: 'doc-1', title: 'Plan', content: '{}', updatedAt: '2026-11-19T05:31:00.000Z' };
  const error = documentConflict(current);
  assert.ok(error instanceof ConflictException);
  const out = {};
  const response = { getHeader: () => 'req-12345678', status(code) { out.status = code; return this; }, json(body) { out.body = body; } };
  new AllExceptionsFilter().catch(error, { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ method: 'PATCH', path: '/x' }) }) });
  assert.equal(out.status, 409);
  assert.deepEqual(out.body.current, current);
  assert.match(out.body.message, /changed by someone else/);
});

import { DocumentEvents } from '../dist/productivity/document-events.js';
test('document events: presence is per person, saves reach everyone, and connections are capped', () => {
  const events = new DocumentEvents(); const a = []; const b = [];
  const leaveA = events.subscribe('d1', { id: 'u1', name: 'Ann' }, (e) => a.push(e));
  const leaveB = events.subscribe('d1', { id: 'u2', name: 'Bob' }, (e) => b.push(e));
  const second = events.subscribe('d1', { id: 'u2', name: 'Bob' }, () => {});
  assert.deepEqual(events.viewers('d1').map((v) => v.name), ['Ann', 'Bob'], 'two tabs are one person');
  events.publish('d1', { type: 'saved', updatedAt: 'x', by: { id: 'u1', name: 'Ann' } });
  events.publish('d2', { type: 'saved', updatedAt: 'y', by: { id: 'u1', name: 'Ann' } });
  assert.equal(a.filter((e) => e.type === 'saved').length, 1); assert.equal(b.filter((e) => e.type === 'saved').length, 1);
  second(); leaveB(); assert.deepEqual(events.viewers('d1').map((v) => v.name), ['Ann']);
  leaveA(); assert.deepEqual(events.viewers('d1'), []);
  events.subscribe('d1', { id: 'u3', name: 'Cy' }, () => { throw new Error('broken'); });
  assert.doesNotThrow(() => events.publish('d1', { type: 'presence', viewers: [] }));
  const releases = Array.from({ length: 10 }, () => events.acquire('u9')); assert.ok(releases.every(Boolean));
  assert.equal(events.acquire('u9'), null); releases[0](); assert.ok(events.acquire('u9'));
});
