// Live checks of the outside services AVEN is configured for, through AVEN's own client code (run `npm run build` first).
// Safe by design: refuses live Stripe keys, sends email only to Resend's test inbox (delivered@resend.dev), expires the
// Stripe checkout session it opens, and never prints a key or other secret. Usage, from apps/api:
//   node scripts/live-integration-check.mjs
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// The root .env, read into the environment without echoing anything.
for (const line of readFileSync(new URL('../../../.env', import.meta.url), 'utf8').split('\n')) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
}
const { readApiEnvironment } = await import('../dist/config/api-environment.js');
const { StripeClient } = await import('../dist/billing/stripe.js');
const { defaultCatalog } = await import('../dist/billing/plans.js');
const { GeminiProvider } = await import('../dist/ai/gemini.js');
const { TavilyWebSearch } = await import('../dist/ai/web-search.js');
const { ResendMailer } = await import('../dist/email/mailer.js');
const env = readApiEnvironment();
const results = [];
const check = async (name, run) => {
  try { results.push({ name, result: 'pass', detail: await run() }); }
  catch (error) { results.push({ name, result: 'FAIL', detail: (error instanceof Error ? error.message : String(error)).replace(/(sk|pk|rk|whsec|re)_[A-Za-z0-9_]{6,}/g, '[redacted]') }); }
};
const skip = (name, why) => results.push({ name, result: 'not run', detail: why });

if (!env.stripeSecretKey) skip('Stripe', 'STRIPE_SECRET_KEY not set');
else if (!env.stripeSecretKey.startsWith('sk_test_')) skip('Stripe', 'refusing: not a test-mode key');
else {
  const stripe = new StripeClient({ secretKey: env.stripeSecretKey, baseUrl: env.stripeBaseUrl, managedPayments: env.stripeManagedPayments });
  const catalog = defaultCatalog({ storageBytes: 0, aiCredits: 0 });
  for (const plan of ['PLUS', 'PRO', 'BUSINESS']) {
    await check(`Stripe price for ${plan}`, async () => {
      const priceId = env.stripePrices?.[plan]; if (!priceId) throw new Error(`STRIPE_PRICE_${plan} not set`);
      const price = await stripe.getPrice(priceId);
      const problems = [!price.active && 'inactive', price.currency !== catalog[plan].currency && `currency ${price.currency}`, price.unitAmount !== catalog[plan].priceCents && `amount ${price.unitAmount} ≠ ${catalog[plan].priceCents}`, price.interval !== 'month' && `interval ${price.interval}`].filter(Boolean);
      if (problems.length) throw new Error(problems.join(', '));
      return `active, ${price.currency.toUpperCase()} ${(price.unitAmount / 100).toFixed(2)} a month, matches plans.ts`;
    });
  }
  await check('Stripe Checkout session (test mode)', async () => {
    const url = await stripe.createCheckout({ priceId: env.stripePrices.PLUS, quantity: 1, workspaceId: randomUUID(), planKey: 'PLUS', customerEmail: 'aven-live-check@example.com', successUrl: 'http://localhost:3000/workspace/settings?checkout=success', cancelUrl: 'http://localhost:3000/workspace/settings' });
    const id = new URL(url).pathname.match(/cs_test_[A-Za-z0-9]+/)?.[0];
    if (new URL(url).hostname !== 'checkout.stripe.com' || !id) throw new Error('unexpected checkout address');
    const expired = await fetch(`https://api.stripe.com/v1/checkout/sessions/${id}/expire`, { method: 'POST', headers: { Authorization: `Bearer ${env.stripeSecretKey}` } });
    return `opened on checkout.stripe.com and expired again (${expired.ok ? 'ok' : `expire HTTP ${expired.status}`})`;
  });
}

if (!env.aiApiKey) skip('AI provider', 'no AI key set');
else await check(`AI provider (${env.aiProvider}, ${env.aiModel})`, async () => {
  if (env.aiProvider !== 'gemini') return 'skipped: only the Gemini path is checked here';
  const provider = new GeminiProvider({ apiKey: env.aiApiKey, model: env.aiModel, baseUrl: env.aiBaseUrl });
  let text = ''; let stop = '';
  for await (const event of provider.stream({ system: 'Reply with the single word OK.', messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }], tools: [], maxTokens: 20 })) { if (event.type === 'text') text += event.text; if (event.type === 'stop') stop = event.reason; }
  if (!text.trim()) throw new Error(`no text returned (stop: ${stop || 'none'})`);
  return `streamed a reply (${text.trim().length} characters, stop: ${stop || 'end'})`;
});

if (!env.webSearch) skip('Web search (Tavily)', 'TAVILY_API_KEY not set');
else await check('Web search (Tavily)', async () => { const hits = await new TavilyWebSearch(env.webSearch).search('calm productivity workspace'); if (!hits.length) throw new Error('no results'); return `${hits.length} results`; });

if (!env.emailApiKey || !env.emailFrom) skip('Email (Resend)', 'EMAIL_API_KEY / EMAIL_FROM not set');
else await check('Email (Resend) to the test inbox delivered@resend.dev', async () => {
  await new ResendMailer({ apiKey: env.emailApiKey, from: env.emailFrom, baseUrl: env.emailBaseUrl }).send({ to: 'delivered@resend.dev', subject: 'AVEN integration check', text: 'This is an automated check of AVEN’s email set-up.', html: '<p>This is an automated check of AVEN’s email set-up.</p>', idempotencyKey: `aven-live-check-${randomUUID()}` });
  return 'accepted by Resend';
});

for (const row of results) console.log(`${row.result.padEnd(7)} ${row.name}: ${row.detail}`);
process.exit(results.some((row) => row.result === 'FAIL') ? 1 : 0);
