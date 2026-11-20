import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canManage, canReceiveOwnership } from '../dist/productivity/member-rules.js';

test('owners manage everyone but the owner; administrators only manage non-administrators and cannot create administrators', () => {
  for (const target of ['ADMINISTRATOR', 'MANAGER', 'MEMBER', 'GUEST']) assert.equal(canManage('OWNER', target, 'MEMBER'), true);
  assert.equal(canManage('OWNER', 'OWNER'), false);
  assert.equal(canManage('ADMINISTRATOR', 'MEMBER', 'MANAGER'), true);
  assert.equal(canManage('ADMINISTRATOR', 'GUEST'), true);
  assert.equal(canManage('ADMINISTRATOR', 'MEMBER', 'ADMINISTRATOR'), false, 'cannot promote to administrator');
  assert.equal(canManage('ADMINISTRATOR', 'ADMINISTRATOR'), false);
  assert.equal(canManage('ADMINISTRATOR', 'OWNER'), false);
  for (const actor of ['MANAGER', 'MEMBER', 'GUEST']) assert.equal(canManage(actor, 'GUEST'), false);
});

test('ownership goes to a member who is neither the owner nor a guest', () => {
  assert.deepEqual(['ADMINISTRATOR', 'MANAGER', 'MEMBER'].map(canReceiveOwnership), [true, true, true]);
  assert.deepEqual(['OWNER', 'GUEST'].map(canReceiveOwnership), [false, false]);
});
