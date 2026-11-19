import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { verifyStripeSignature } from '../dist/billing/stripe.js';

const secret = 'whsec_test';
const body = Buffer.from('{"id":"evt_1"}');
const sign = (t, b = body, s = secret) => `t=${t},v1=${createHmac('sha256', s).update(`${t}.${b}`).digest('hex')}`;
const now = 1_700_000_000_000;
const t = now / 1000;

test('accepts a correctly signed, fresh webhook', () => assert.equal(verifyStripeSignature(body, sign(t), secret, now), true));
test('rejects a wrong secret, a changed body, a missing header and garbage', () => {
  assert.equal(verifyStripeSignature(body, sign(t, body, 'other'), secret, now), false);
  assert.equal(verifyStripeSignature(Buffer.from('{"id":"evt_2"}'), sign(t), secret, now), false);
  assert.equal(verifyStripeSignature(body, undefined, secret, now), false);
  assert.equal(verifyStripeSignature(body, 'nonsense', secret, now), false);
});
test('rejects a replayed old signature but allows a small clock difference', () => {
  assert.equal(verifyStripeSignature(body, sign(t - 3600), secret, now), false);
  assert.equal(verifyStripeSignature(body, sign(t - 60), secret, now), true);
});
