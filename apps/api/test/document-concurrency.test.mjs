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
