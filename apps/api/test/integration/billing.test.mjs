import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { boot, skip } from './harness.mjs';

const SECRET = 'whsec_integration';

describe('plans, limits and billing', { skip }, () => {
  let t; let W; let stripe; let stripeCalls; let seq = 0;
  const ws = (w = W) => `/workspaces/${w.id}`;
  const signed = (event, secret = SECRET) => { const body = JSON.stringify(event); const ts = Math.floor(Date.now() / 1000); return { body, headers: { 'stripe-signature': `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`, 'content-type': 'application/json' } }; };
  const hook = async (event, secret) => { const { body, headers } = signed(event, secret); const r = await fetch(`${t.base}/billing/webhook`, { method: 'POST', body, headers }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const event = (type, object) => ({ id: `evt_${++seq}_${t.run}`, type, data: { object } });
  const subscriptionEvent = (type, workspaceId, fields = {}) => event(type, { object: 'subscription', id: `sub_${t.run}`, customer: `cus_${t.run}`, status: 'active', metadata: { workspaceId, plan: 'PRO' }, cancel_at_period_end: false, current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30, items: { data: [{ price: { id: 'price_pro' }, quantity: 1 }] }, ...fields });

  const stripePrices = { price_plus: { currency: 'aud', unit_amount: 999 }, price_pro: { currency: 'aud', unit_amount: 1999 }, price_business: { currency: 'aud', unit_amount: 2999 } };
  before(async () => {
    stripeCalls = [];
    stripe = createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { stripeCalls.push({ method: req.method, url: req.url, body: b }); res.setHeader('content-type', 'application/json'); if (req.url.startsWith('/v1/prices/')) { const id = req.url.split('?')[0].split('/').pop(); return res.end(JSON.stringify({ id, active: true, recurring: { interval: 'month', usage_type: 'licensed' }, ...stripePrices[id] })); } if (req.url === '/v1/checkout/sessions') return res.end(JSON.stringify({ url: 'https://checkout.stripe.test/session' })); if (req.url === '/v1/billing_portal/sessions') return res.end(JSON.stringify({ url: 'https://billing.stripe.test/portal' })); if (req.method === 'GET') return res.end(JSON.stringify({ items: { data: [{ id: 'si_1' }] } })); res.end('{}'); }); });
    await new Promise((resolve) => stripe.listen(0, '127.0.0.1', resolve));
    t = await boot({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_BASE_URL: `http://127.0.0.1:${stripe.address().port}`, STRIPE_PRICE_PLUS: 'price_plus', STRIPE_PRICE_PRO: 'price_pro', STRIPE_PRICE_BUSINESS: 'price_business' });
    for (const name of ['olive', 'mia']) await t.user(name);
    W = await t.workspace('olive'); await t.member(W.id, 'mia', 'MEMBER');
  });
  after(async () => { await t?.close(); await new Promise((resolve) => stripe.close(resolve)); });

  test('a new workspace is on Free, with limits and usage shown', async () => {
    const r = await t.call('olive', 'GET', `${ws()}/billing`);
    assert.equal(r.status, 200);
    assert.equal(r.body.plan.key, 'FREE'); assert.equal(r.body.limits.projects, 5); assert.equal(r.body.usage.projects, 0);
    assert.equal(r.body.canManage, true); assert.equal(r.body.plans.find((p) => p.key === 'PRO').purchasable, true); assert.equal(r.body.plans.find((p) => p.key === 'ENTERPRISE').purchasable, false);
    assert.equal((await t.call('mia', 'GET', `${ws()}/billing`)).body.canManage, false);
  });

  test('Free limits are enforced on the server with a 402 that says what to do', async () => {
    for (let i = 0; i < 5; i += 1) assert.equal((await t.call('olive', 'POST', `${ws()}/projects`, { name: `P${i}` })).status, 201);
    const sixth = await t.call('olive', 'POST', `${ws()}/projects`, { name: 'P6' });
    assert.equal(sixth.status, 402); assert.match(sixth.body.message, /Free/);
    assert.equal((await t.call('olive', 'POST', `${ws()}/ai/agents`, { name: 'Mine', description: '', instructions: 'Help.', tools: [] })).status, 402);
    assert.equal((await t.call('olive', 'POST', `${ws()}/ai/conversations`, { agentKey: 'system:research-analyst' })).status, 402);
  });

  test('only the owner can start checkout or open the portal, and the provider is asked for the right thing', async () => {
    assert.equal((await t.call('mia', 'POST', `${ws()}/billing/checkout`, { plan: 'PRO' })).status, 403);
    assert.equal((await t.call('olive', 'POST', `${ws()}/billing/checkout`, { plan: 'ENTERPRISE' })).status, 400);
    assert.equal((await t.call('olive', 'POST', `${ws()}/billing/checkout`, { plan: 'NOPE' })).status, 400);
    const ok = await t.call('olive', 'POST', `${ws()}/billing/checkout`, { plan: 'BUSINESS' });
    assert.equal(ok.body.url, 'https://checkout.stripe.test/session');
    const sent = new URLSearchParams(stripeCalls.at(-1).body);
    assert.equal(sent.get('line_items[0][price]'), 'price_business'); assert.equal(sent.get('line_items[0][quantity]'), '2'); assert.equal(sent.get('metadata[workspaceId]'), W.id);
    assert.equal((await t.call('olive', 'POST', `${ws()}/billing/portal`)).status, 400);
  });

  test('webhooks need a valid signature', async () => {
    const e = subscriptionEvent('customer.subscription.created', W.id);
    assert.equal((await hook(e, 'whsec_wrong')).status, 400);
    const r = await fetch(`${t.base}/billing/webhook`, { method: 'POST', body: JSON.stringify(e), headers: { 'content-type': 'application/json' } });
    assert.equal(r.status, 400);
    assert.equal((await t.prisma.subscription.findUnique({ where: { workspaceId: W.id } })), null);
  });

  test('a subscription event upgrades the workspace; repeating it changes nothing', async () => {
    const e = subscriptionEvent('customer.subscription.created', W.id);
    assert.deepEqual((await hook(e)).body, { received: true, result: 'applied' });
    assert.equal((await hook(e)).body.result, 'duplicate');
    const r = await t.call('olive', 'GET', `${ws()}/billing`);
    assert.equal(r.body.plan.key, 'PRO'); assert.equal(r.body.status, 'ACTIVE'); assert.equal(r.body.limits.projects, null); assert.equal(r.body.hasBillingAccount, true);
    assert.equal((await t.call('olive', 'POST', `${ws()}/projects`, { name: 'P6' })).status, 201);
    assert.equal((await t.call('olive', 'POST', `${ws()}/ai/agents`, { name: 'Mine', description: '', instructions: 'Help.', tools: [] })).status, 201);
    assert.equal((await t.call('olive', 'POST', `${ws()}/billing/portal`)).body.url, 'https://billing.stripe.test/portal');
    assert.equal((await t.call('olive', 'POST', `${ws()}/billing/checkout`, { plan: 'PLUS' })).status, 409);
  });

  test('an event for someone else’s customer cannot take over this workspace', async () => {
    await hook(subscriptionEvent('customer.subscription.updated', W.id, { customer: 'cus_attacker', metadata: { workspaceId: W.id, plan: 'PLUS' }, items: { data: [{ price: { id: 'price_plus' }, quantity: 1 }] } }));
    assert.equal((await t.prisma.subscription.findUnique({ where: { workspaceId: W.id } })).planKey, 'PRO');
  });

  test('invoices are stored and shown', async () => {
    await hook(event('invoice.paid', { id: `in_${t.run}`, object: 'invoice', customer: `cus_${t.run}`, number: 'AVEN-0001', status: 'paid', total: 1999, currency: 'aud', hosted_invoice_url: 'https://invoice.stripe.test/i', created: Math.floor(Date.now() / 1000) }));
    const invoice = (await t.call('olive', 'GET', `${ws()}/billing`)).body.invoices[0];
    assert.equal(invoice.amountCents, 1999); assert.equal(invoice.number, 'AVEN-0001'); assert.equal(invoice.status, 'paid');
  });

  test('cancelling drops to Free limits without deleting anything', async () => {
    const before = await t.prisma.project.count({ where: { workspaceId: W.id } });
    assert.equal(before, 6);
    await hook(subscriptionEvent('customer.subscription.deleted', W.id, { status: 'canceled' }));
    const r = await t.call('olive', 'GET', `${ws()}/billing`);
    assert.equal(r.body.plan.key, 'FREE'); assert.equal(r.body.limits.projects, 5);
    assert.equal(await t.prisma.project.count({ where: { workspaceId: W.id } }), 6);
    assert.equal((await t.call('olive', 'GET', `${ws()}/projects`)).body.length ?? 6, 6);
    assert.equal((await t.call('olive', 'POST', `${ws()}/projects`, { name: 'blocked' })).status, 402);
    assert.equal((await t.call('olive', 'GET', `${ws()}/ai/agents`)).status, 200);
  });

  test('advanced automation steps need a plan that includes them, and Business billing follows the seat count', async () => {
    const webhook = { name: 'Hook', description: '', trigger: { type: 'task_status_changed', toStatus: 'COMPLETED' }, steps: [{ id: 'w1', type: 'webhook', url: 'https://example.com/hook' }] };
    assert.equal((await t.call('olive', 'POST', `${ws()}/workflows`, webhook)).status, 402);
    await t.plan(W.id, 'BUSINESS', { seats: 2, providerSubscriptionId: `sub_${t.run}`, providerCustomerId: `cus_${t.run}`, provider: 'stripe' });
    assert.equal((await t.call('olive', 'POST', `${ws()}/workflows`, webhook)).status, 201);
    await t.user('noa');
    const invited = await t.call('olive', 'POST', `${ws()}/members/invitations`, { email: `noa-${t.run}@integration.test`, role: 'MEMBER' });
    assert.equal(invited.status, 201, JSON.stringify(invited.body));
    const accepted = await t.call('noa', 'POST', `/invitations/${invited.body.token}/accept`);
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
    assert.equal((await t.prisma.subscription.findUnique({ where: { workspaceId: W.id } })).seats, 3);
    assert.ok(stripeCalls.some((c) => c.method === 'POST' && c.url.startsWith('/v1/subscription_items')));
  });

  test('Free members are capped, but guests are not counted', async () => {
    const F = await t.workspace('mia', 'Small'); await t.user('x1'); await t.user('x2');
    await t.member(F.id, 'x1', 'MEMBER'); await t.member(F.id, 'x2', 'MEMBER');
    const blocked = await t.call('mia', 'POST', `${ws(F)}/members/invitations`, { email: 'new@integration.test', role: 'MEMBER' });
    assert.equal(blocked.status, 402);
    assert.equal((await t.call('mia', 'POST', `${ws(F)}/members/invitations`, { email: 'guest@integration.test', role: 'GUEST' })).status, 201);
  });

  test('checkout refuses to start when the price in Stripe is not the price AVEN shows', async () => {
    const original = { ...stripePrices.price_pro };
    try {
      for (const [change, pattern] of [[{ currency: 'usd' }, /A?UD 19\.99|AUD 19\.99/], [{ unit_amount: 1500 }, /19\.99/]]) {
        Object.assign(stripePrices.price_pro, change);
        const before = stripeCalls.filter((c) => c.url === '/v1/checkout/sessions').length;
        const refused = await t.call('olive', 'POST', `${ws()}/billing/checkout`, { plan: 'PRO' });
        assert.equal(refused.status, 503, JSON.stringify(refused.body)); assert.match(refused.body.message, /STRIPE_PRICE_PRO/); assert.match(refused.body.message, pattern);
        assert.equal(stripeCalls.filter((c) => c.url === '/v1/checkout/sessions').length, before, 'no checkout was created at the wrong price');
        Object.assign(stripePrices.price_pro, original);
      }
    } finally { Object.assign(stripePrices.price_pro, original); }
    const fine = await t.call('olive', 'POST', `${ws()}/billing/checkout`, { plan: 'PRO' }); assert.notEqual(fine.status, 503, 'with the right price the price check lets it through (it may still stop for another reason, such as an existing subscription)');
  });

  test('an invoice that arrives before its subscription event is still filed, and cannot be filed against another customer’s workspace', async () => {
    const early = await t.call('olive', 'POST', '/session/workspaces', { name: `Early invoice ${t.run}` });
    const E = early.body.id; const invoice = (id, customer, workspaceId) => event('invoice.paid', { id, object: 'invoice', customer, status: 'paid', total: 999, amount_due: 999, amount_paid: 999, currency: 'aud', number: 'AVEN-0001', created: Math.floor(Date.now() / 1000), parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_x', metadata: { workspaceId, plan: 'PLUS' } } } });
    assert.equal((await hook(invoice(`in_${t.run}_1`, 'cus_early', E))).status, 200);
    assert.equal(await t.prisma.billingInvoice.count({ where: { workspaceId: E } }), 1, 'filed under the workspace the invoice names, before any subscription exists');
    await t.prisma.subscription.create({ data: { workspaceId: E, planKey: 'PLUS', status: 'ACTIVE', seats: 1, providerCustomerId: 'cus_early' } });
    assert.equal((await hook(invoice(`in_${t.run}_2`, 'cus_someone_else', E))).status, 200);
    assert.equal(await t.prisma.billingInvoice.count({ where: { workspaceId: E } }), 1, 'an invoice for a different customer is not filed under this workspace');
    assert.equal((await hook(invoice(`in_${t.run}_3`, 'cus_nobody', '00000000-0000-4000-8000-000000000000'))).status, 200);
    assert.equal(await t.prisma.billingInvoice.count({ where: { providerInvoiceId: `in_${t.run}_3` } }), 0, 'a workspace that does not exist is ignored');
  });
});
