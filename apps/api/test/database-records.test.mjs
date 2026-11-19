import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { computeRollup, parseBulkIds, rollupFunctions } from '../dist/productivity/database-records.js';
import { recordConflict } from '../dist/productivity/document-concurrency.js';

const linked = [{ cost: 10 }, { cost: 20.5 }, { cost: 'n/a' }, {}];

test('count rollups count linked records whatever their values', () => {
  assert.equal(computeRollup('count', linked), 4);
  assert.equal(computeRollup('count', []), 0);
});

test('numeric rollups ignore non-numeric and missing values', () => {
  assert.equal(computeRollup('sum', linked, 'cost'), 30.5);
  assert.equal(computeRollup('average', linked, 'cost'), 15.25);
  assert.equal(computeRollup('min', linked, 'cost'), 10);
  assert.equal(computeRollup('max', linked, 'cost'), 20.5);
});

test('rollups over nothing numeric: sum is zero, the rest are empty', () => {
  assert.equal(computeRollup('sum', [{}], 'cost'), 0);
  for (const fn of ['average', 'min', 'max']) assert.equal(computeRollup(fn, [{ cost: 'x' }], 'cost'), null);
  assert.equal(computeRollup('sum', linked), 0);
});

test('every supported rollup function is computable', () => {
  for (const fn of rollupFunctions) assert.doesNotThrow(() => computeRollup(fn, linked, 'cost'));
});

test('bulk ids must be 1-200 valid UUIDs and are de-duplicated', () => {
  const a = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
  assert.deepEqual(parseBulkIds([a, a]), [a]);
  for (const value of [undefined, [], 'x', ['nope'], [1], Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)]) {
    assert.throws(() => parseBulkIds(value), BadRequestException);
  }
  assert.equal(parseBulkIds(Array.from({ length: 200 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)).length, 200);
});

test('a record conflict is a 409 carrying the current record', () => {
  const error = recordConflict({ id: 'r1' });
  assert.ok(error instanceof ConflictException);
  assert.deepEqual(error.getResponse().current, { id: 'r1' });
});
