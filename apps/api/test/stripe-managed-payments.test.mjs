import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { BillingProviderError, MANAGED_PAYMENTS_TAX_CODE, MANAGED_PAYMENTS_VERSION, StripeClient } from '../dist/billing/stripe.js';
import { readApiEnvironment } from '../dist/config/api-environment.js';

/** A local stand-in for Stripe: records each request and answers with the given JSON. */
async function withStripe(answer, run) {
  const seen = [];
  const server = createServer((req, res) => { let raw = ''; req.on('data', (c) => { raw += c; }); req.on('end', () => {
    seen.push({ method: req.method, url: req.url, headers: req.headers, form: Object.fromEntries(new URLSearchParams(raw)) });
    const [status, body] = answer(req.url); res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body));
  }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`, seen); } finally { server.closeAllConnections?.(); server.close(); }
}
const checkout = { priceId: 'price_123', quantity: 2, workspaceId: 'w1', planKey: 'PRO', customerEmail: 'a@example.com', successUrl: 'https://app.test/ok', cancelUrl: 'https://app.test/no' };

test('Managed Payments on: checkout turns it on and sends the preview version header', async () => {
  await withStripe(() => [200, { id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' }], async (baseUrl, seen) => {
    const url = await new StripeClient({ secretKey: 'sk_test_x', baseUrl, managedPayments: true }).createCheckout(checkout);
    assert.equal(url, 'https://checkout.stripe.com/c/pay/cs_1');
    assert.equal(seen[0].url, '/v1/checkout/sessions');
    assert.equal(seen[0].headers['stripe-version'], MANAGED_PAYMENTS_VERSION); assert.equal(MANAGED_PAYMENTS_VERSION, '2026-02-25.preview');
    assert.equal(seen[0].form['managed_payments[enabled]'], 'true');
    assert.deepEqual([seen[0].form.mode, seen[0].form['line_items[0][price]'], seen[0].form['line_items[0][quantity]']], ['subscription', 'price_123', '2']);
    assert.equal(seen[0].headers.authorization, 'Bearer sk_test_x');
  });
});

test('Managed Payments off (the default): no version header and no managed_payments field', async () => {
  await withStripe(() => [200, { id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' }], async (baseUrl, seen) => {
    await new StripeClient({ secretKey: 'sk_test_x', baseUrl }).createCheckout(checkout);
    assert.equal(seen[0].headers['stripe-version'], undefined);
    assert.equal('managed_payments[enabled]' in seen[0].form, false);
  });
});

test('creating a plan product sends the tax code, monthly default price and preview version, and returns the price id', async () => {
  await withStripe(() => [200, { id: 'prod_1', default_price: 'price_9' }], async (baseUrl, seen) => {
    const result = await new StripeClient({ secretKey: 'sk_test_x', baseUrl }).createPlanProduct({ name: 'AVEN Pro', planKey: 'PRO', currency: 'aud', unitAmount: 1999 });
    assert.deepEqual(result, { productId: 'prod_1', priceId: 'price_9' });
    assert.equal(seen[0].url, '/v1/products'); assert.equal(seen[0].headers['stripe-version'], MANAGED_PAYMENTS_VERSION);
    assert.deepEqual(seen[0].form, { name: 'AVEN Pro', tax_code: MANAGED_PAYMENTS_TAX_CODE, 'metadata[plan]': 'PRO', 'default_price_data[currency]': 'aud', 'default_price_data[unit_amount]': '1999', 'default_price_data[recurring][interval]': 'month' });
    assert.equal(MANAGED_PAYMENTS_TAX_CODE, 'txcd_10103100');
  });
  await withStripe(() => [200, { id: 'prod_1' }], async (baseUrl) => {
    await assert.rejects(new StripeClient({ secretKey: 'sk_test_x', baseUrl }).createPlanProduct({ name: 'n', planKey: 'PRO', currency: 'aud', unitAmount: 1 }), BillingProviderError);
  });
});

test('Stripe refusals and limits become safe messages that do not repeat the key', async () => {
  const run = (status, body) => withStripe(() => [status, body], (baseUrl) => new StripeClient({ secretKey: 'sk_test_secretvalue', baseUrl, managedPayments: true }).createCheckout(checkout).then(() => null, (e) => e));
  const rejected = await run(401, { error: { message: 'Invalid API Key provided: sk_test_secretvalue' } });
  assert.match(rejected.message, /STRIPE_SECRET_KEY/); assert.ok(!rejected.message.includes('secretvalue')); assert.equal(rejected.retry, false);
  assert.equal((await run(429, { error: {} })).retry, true);
  const refused = await run(400, { error: { message: 'Managed Payments is not available for this account.' } });
  assert.match(refused.message, /Managed Payments is not available/); assert.equal(refused.retry, false);
});

test('STRIPE_MANAGED_PAYMENTS defaults to off and only accepts true or false', () => {
  const base = { DATABASE_URL: 'postgresql://aven:x@localhost:5432/aven' };
  assert.equal(readApiEnvironment(base).stripeManagedPayments, false);
  assert.equal(readApiEnvironment({ ...base, STRIPE_MANAGED_PAYMENTS: 'true' }).stripeManagedPayments, true);
  assert.throws(() => readApiEnvironment({ ...base, STRIPE_MANAGED_PAYMENTS: 'yes' }), /STRIPE_MANAGED_PAYMENTS/);
});
