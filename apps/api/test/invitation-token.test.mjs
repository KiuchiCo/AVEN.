import assert from 'node:assert/strict';
import test from 'node:test';
import { createInvitationToken, hashInvitationToken } from '../src/productivity/invitation-token.ts';

test('invitation tokens are cryptographically random URL-safe secrets', () => {
  const first = createInvitationToken();
  const second = createInvitationToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
});

test('invitation storage uses a stable SHA-256 digest rather than the raw token', () => {
  const token = 'a-private-invitation-token';
  const digest = hashInvitationToken(token);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(hashInvitationToken(token), digest);
  assert.notEqual(digest, token);
  assert.notEqual(hashInvitationToken(`${token}-changed`), digest);
});
