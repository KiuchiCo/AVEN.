// Creates one Stripe product (with its monthly default price and the Managed Payments tax code) for each paid AVEN plan,
// then prints the STRIPE_PRICE_* lines to paste into your environment. Run `npm run build` first.
//   STRIPE_SECRET_KEY=sk_test_... npm run billing:create-plan-products              (shows what it would create)
//   STRIPE_SECRET_KEY=sk_test_... npm run billing:create-plan-products -- --create   (creates them in Stripe TEST mode)
// It refuses live keys on purpose: create live products yourself in the Dashboard, or after reviewing the test run.
// Running it twice creates duplicate products, so keep the printed ids.
import { buildCatalog, parsePlanOverrides } from '../dist/billing/plans.js';
import { StripeClient } from '../dist/billing/stripe.js';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error('Set STRIPE_SECRET_KEY to a test-mode key from the Stripe Dashboard (Developers > API keys).'); process.exit(1); }
if (!/^(sk|rk)_test_/.test(key)) { console.error('This script only works with a test-mode key (sk_test_… or rk_test_…). It will not touch live mode.'); process.exit(1); }

const { overrides, errors } = parsePlanOverrides(process.env.BILLING_PLAN_OVERRIDES);
if (errors.length) { console.error(`BILLING_PLAN_OVERRIDES is not valid: ${errors[0]}`); process.exit(1); }
const catalog = buildCatalog({ storageBytes: 0, aiCredits: 0 }, overrides);
const plans = Object.values(catalog).filter((plan) => plan.selfServe && plan.priceCents);
const create = process.argv.includes('--create');
const stripe = new StripeClient({ secretKey: key, baseUrl: process.env.STRIPE_BASE_URL || 'https://api.stripe.com' });

for (const plan of plans) {
  const label = `AVEN ${plan.name} (${plan.currency.toUpperCase()} ${(plan.priceCents / 100).toFixed(2)} per month${plan.perSeat ? ' per seat' : ''})`;
  if (!create) { console.log(`Would create: ${label}`); continue; }
  const { productId, priceId } = await stripe.createPlanProduct({ name: `AVEN ${plan.name}`, planKey: plan.key, currency: plan.currency, unitAmount: plan.priceCents });
  console.error(`Created ${label}: product ${productId}`);
  console.log(`STRIPE_PRICE_${plan.key}=${priceId}`);
}
if (!create) console.log('\nNothing was created. Add --create to create these in Stripe test mode.');
