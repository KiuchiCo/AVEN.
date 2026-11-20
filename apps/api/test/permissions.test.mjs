import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultPolicy, parsePolicyUpdate, readPolicy, roleAllows } from '../dist/billing/permission-rules.js';

test('roles are compared by seniority', () => {
  assert.equal(roleAllows('MEMBER', 'MEMBERS'), true);
  assert.equal(roleAllows('MEMBER', 'MANAGERS'), false);
  assert.equal(roleAllows('MANAGER', 'MANAGERS'), true);
  assert.equal(roleAllows('MANAGER', 'ADMINS'), false);
  assert.equal(roleAllows('ADMINISTRATOR', 'ADMINS'), true);
  assert.equal(roleAllows('OWNER', 'ADMINS'), true);
  assert.equal(roleAllows('GUEST', 'MEMBERS'), false);
  assert.equal(roleAllows(undefined, 'MEMBERS'), false);
});

test('a stored policy falls back to the default for anything unrecognised', () => {
  assert.deepEqual(readPolicy({}), defaultPolicy);
  assert.deepEqual(readPolicy(null), defaultPolicy);
  assert.deepEqual(readPolicy({ projects: 'ADMINS', sharing: 'nonsense', extra: 1 }), { ...defaultPolicy, projects: 'ADMINS' });
});

test('updates change only the keys sent and reject unknown keys, bad levels and empty bodies', () => {
  assert.deepEqual(parsePolicyUpdate({ automations: 'MANAGERS' }, defaultPolicy), { ...defaultPolicy, automations: 'MANAGERS' });
  assert.throws(() => parsePolicyUpdate({ nope: 'ADMINS' }, defaultPolicy), /Unknown permission/);
  assert.throws(() => parsePolicyUpdate({ projects: 'EVERYONE' }, defaultPolicy), /must be one of/);
  assert.throws(() => parsePolicyUpdate({}, defaultPolicy), /at least one/);
  assert.throws(() => parsePolicyUpdate([], defaultPolicy), /JSON object/);
});
