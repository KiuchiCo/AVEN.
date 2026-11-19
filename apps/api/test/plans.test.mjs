import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCatalog, defaultCatalog, limitMessage, parsePlanOverrides, planKeys, resolveEntitlements, withinLimit } from '../dist/billing/plans.js';
import { readApiEnvironment } from '../dist/config/api-environment.js';

const env = { storageBytes: 500 * 1024 * 1024, aiCredits: 200 };
const catalog = buildCatalog(env);
const resolve = (subscription, c = catalog) => resolveEntitlements(subscription, c);
const GB = 1024 ** 3;

test('the five plans exist with the proposed prices, and only Business is billed per seat', () => {
  assert.deepEqual(planKeys, ['FREE', 'PLUS', 'PRO', 'BUSINESS', 'ENTERPRISE']);
  assert.deepEqual(planKeys.map((key) => catalog[key].priceCents), [0, 999, 1999, 2999, null]);
  assert.deepEqual(planKeys.filter((key) => catalog[key].perSeat), ['BUSINESS']);
  assert.deepEqual(planKeys.filter((key) => catalog[key].selfServe), ['PLUS', 'PRO', 'BUSINESS']);
  assert.ok(planKeys.every((key) => catalog[key].currency === 'aud'));
});

test('limits only grow as you move up the plans, so an upgrade never takes anything away', () => {
  const order = ['FREE', 'PLUS', 'PRO'];
  for (const key of ['projects', 'databases', 'workflows', 'customAgents', 'members', 'storageBytes', 'aiCredits']) {
    const values = order.map((plan) => catalog[plan].limits[key]);
    for (let i = 1; i < values.length; i += 1) assert.ok(values[i] === null || (values[i - 1] !== null && values[i] >= values[i - 1]), `${key}: ${values}`);
  }
  assert.deepEqual(catalog.FREE.features, []);
  assert.deepEqual(catalog.PLUS.features, []);
  assert.deepEqual([...catalog.PRO.features].sort(), ['advancedAutomation', 'aiAgents']);
  assert.ok(Object.values(catalog.ENTERPRISE.limits).every((value) => value === null));
});

test('Free follows the existing environment limits, so nothing changes for current installs', () => {
  assert.deepEqual([catalog.FREE.limits.storageBytes, catalog.FREE.limits.aiCredits], [500 * 1024 * 1024, 200]);
  assert.equal(defaultCatalog({ storageBytes: 1, aiCredits: 2 }).FREE.limits.aiCredits, 2);
});

test('a workspace with no subscription is on Free', () => {
  const free = resolve(null);
  assert.deepEqual([free.planKey, free.limits.projects, free.features.size], ['FREE', 5, 0]);
});

test('an active subscription gives its plan’s limits and features', () => {
  const pro = resolve({ planKey: 'PRO', status: 'ACTIVE', seats: 1 });
  assert.deepEqual([pro.planKey, pro.limits.projects, pro.limits.aiCredits, pro.features.has('aiAgents'), pro.features.has('advancedAutomation')], ['PRO', null, 10_000, true, true]);
  assert.equal(resolve({ planKey: 'PLUS', status: 'TRIALING', seats: 1 }).planKey, 'PLUS');
  assert.equal(resolve({ planKey: 'PLUS', status: 'PAST_DUE', seats: 1 }).planKey, 'PLUS', 'the provider is still retrying the payment, so access continues');
});

test('a lapsed, cancelled or unfinished subscription falls back to Free, never to something invalid', () => {
  for (const status of ['CANCELED', 'INCOMPLETE', 'UNPAID', 'whatever']) assert.equal(resolve({ planKey: 'PRO', status, seats: 1 }).planKey, 'FREE', status);
  assert.equal(resolve({ planKey: 'GOLD', status: 'ACTIVE', seats: 1 }).planKey, 'FREE', 'an unknown plan is not trusted');
});

test('Business storage and AI credits scale with seats', () => {
  const one = resolve({ planKey: 'BUSINESS', status: 'ACTIVE', seats: 1 });
  const ten = resolve({ planKey: 'BUSINESS', status: 'ACTIVE', seats: 10 });
  assert.deepEqual([one.limits.storageBytes, one.limits.aiCredits, one.seats], [25 * GB, 5_000, 1]);
  assert.deepEqual([ten.limits.storageBytes, ten.limits.aiCredits, ten.seats], [250 * GB, 50_000, 10]);
  assert.equal(ten.limits.members, null);
  for (const seats of [0, -3, 2.9, NaN]) assert.ok(resolve({ planKey: 'BUSINESS', status: 'ACTIVE', seats }).seats >= 1);
  assert.equal(resolve({ planKey: 'PRO', status: 'ACTIVE', seats: 10 }).limits.aiCredits, 10_000, 'only Business scales with seats');
});

test('an Enterprise agreement can set custom limits for one workspace', () => {
  const custom = resolve({ planKey: 'ENTERPRISE', status: 'ACTIVE', seats: 1, limitsOverride: { projects: 100, storageBytes: 5 * GB, aiCredits: null, bogus: 1, workflows: -4, databases: 'lots' } });
  assert.deepEqual([custom.limits.projects, custom.limits.storageBytes, custom.limits.aiCredits, custom.limits.workflows, custom.limits.databases], [100, 5 * GB, null, null, null], 'invalid entries are ignored');
  assert.equal(resolve({ planKey: 'CANCELED', status: 'CANCELED', seats: 1, limitsOverride: { projects: 999 } }).limits.projects, 5, 'overrides do not apply once the subscription lapses');
});

test('limits and messages', () => {
  assert.deepEqual([withinLimit(4, 5), withinLimit(5, 5), withinLimit(999, null), withinLimit(0, 0)], [true, false, true, false]);
  assert.equal(limitMessage('projects', 5, 'Free'), 'The Free plan allows up to 5 projects. Upgrade to add more.');
  assert.equal(limitMessage('databases', 1, 'Plus'), 'The Plus plan allows up to 1 database. Upgrade to add more.');
  assert.equal(limitMessage('customAgents', 0, 'Free'), 'The Free plan doesn’t include custom agents. Upgrade to add custom agents.');
});

test('prices and limits can be changed without a deploy through BILLING_PLAN_OVERRIDES', () => {
  const { overrides, errors } = parsePlanOverrides(JSON.stringify({ PLUS: { priceCents: 1299, name: 'Plus+', limits: { projects: 40, aiCredits: null } }, BUSINESS: { perSeatLimits: { aiCredits: 9000 } } }));
  assert.deepEqual(errors, []);
  const changed = buildCatalog(env, overrides);
  assert.deepEqual([changed.PLUS.priceCents, changed.PLUS.name, changed.PLUS.limits.projects, changed.PLUS.limits.aiCredits, changed.PLUS.limits.databases], [1299, 'Plus+', 40, null, 15]);
  assert.equal(resolveEntitlements({ planKey: 'BUSINESS', status: 'ACTIVE', seats: 2 }, changed).limits.aiCredits, 18_000);
  assert.equal(changed.PRO.priceCents, 1999, 'other plans are untouched');
  assert.equal(catalog.PLUS.priceCents, 999, 'the defaults are not mutated');
});

test('bad overrides are reported, not half-applied', () => {
  for (const [raw, pattern] of [['{', /valid JSON/], ['[]', /object/], ['{"GOLD":{}}', /unknown plan/], ['{"PLUS":5}', /must be an object/], ['{"PLUS":{"price":1}}', /unknown field/], ['{"PLUS":{"priceCents":-5}}', /priceCents/], ['{"PLUS":{"priceCents":9.5}}', /priceCents/], ['{"PLUS":{"limits":{"cats":1}}}', /unknown limit/], ['{"PLUS":{"limits":{"projects":"many"}}}', /whole number or null/], ['{"PLUS":{"perSeatLimits":{"projects":1}}}', /unknown limit/], ['{"PLUS":{"name":"x"}}'.replace('"x"', JSON.stringify('y'.repeat(121))), /name/]]) {
    assert.match(parsePlanOverrides(raw).errors.join(' | '), pattern, raw);
  }
  assert.deepEqual(parsePlanOverrides(undefined), { overrides: {}, errors: [] });
  assert.throws(() => readApiEnvironment({ DATABASE_URL: 'postgresql://aven:x@localhost:5432/aven', BILLING_PLAN_OVERRIDES: '{"GOLD":{}}' }), /Invalid API environment/);
});

test('payment settings are validated and default to off', () => {
  const base = { DATABASE_URL: 'postgresql://aven:x@localhost:5432/aven' };
  const defaults = readApiEnvironment(base);
  assert.deepEqual([defaults.stripeSecretKey, defaults.stripeBaseUrl, defaults.stripePrices], [undefined, 'https://api.stripe.com', {}]);
  const set = readApiEnvironment({ ...base, STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_PRICE_PLUS: 'price_abc123', STRIPE_PRICE_BUSINESS: 'price_biz' });
  assert.deepEqual([set.stripePrices.PLUS, set.stripePrices.BUSINESS, set.stripePrices.PRO], ['price_abc123', 'price_biz', undefined]);
  for (const bad of [{ STRIPE_SECRET_KEY: 'sk_test_x' }, { STRIPE_PRICE_PLUS: 'plus' }, { STRIPE_PRICE_PRO: 'prod_123' }, { STRIPE_BASE_URL: 'http://example.com' }]) assert.throws(() => readApiEnvironment({ ...base, ...bad }), /Invalid API environment/, JSON.stringify(bad));
});
