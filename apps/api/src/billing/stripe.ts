import { reportIntegrationFailure } from '../observability/error-reporter.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** A failure from the payment provider with a message that is safe to show. */
export class BillingProviderError extends Error {
  constructor(message: string, readonly retry = false) { super(message); }
}

/**
 * Checks a Stripe webhook signature: the header holds a timestamp and one or more HMAC-SHA256 signatures of
 * "timestamp.body" made with the endpoint secret. Old timestamps are refused to stop replays.
 */
export function verifyStripeSignature(rawBody: Buffer, header: string | undefined, secret: string, now = Date.now(), toleranceSeconds = 300): boolean {
  if (!header || !rawBody) return false;
  const parts = header.split(',').map((part) => part.trim().split('=') as [string, string]);
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || !/^\d{1,12}$/.test(timestamp) || !signatures.length) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();
  return signatures.some((signature) => { const given = Buffer.from(signature, 'hex'); return given.length === expected.length && timingSafeEqual(given, expected); });
}

/** The Stripe API version that Managed Payments needs. Only the requests that use it send this header; everything else leaves the version to the account default. */
export const MANAGED_PAYMENTS_VERSION = '2026-02-25.preview';
/** Stripe's tax code for the products AVEN sells through Managed Payments. */
export const MANAGED_PAYMENTS_TAX_CODE = 'txcd_10103100';

type Settings = { secretKey: string; baseUrl: string; /** Stripe becomes the seller of record: it handles sales tax, VAT and GST, fraud checks and order support. */ managedPayments?: boolean };

/** The few Stripe calls AVEN needs, over plain fetch. Plan changes, cancellation and payment methods happen in Stripe's own billing portal. */
export class StripeClient {
  constructor(private readonly settings: Settings) {}

  private async request(method: 'GET' | 'POST', path: string, form?: Record<string, string>, apiVersion?: string): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(`${this.settings.baseUrl.replace(/\/$/, '')}${path}`, {
        method, signal: AbortSignal.timeout(20_000),
        headers: { authorization: `Bearer ${this.settings.secretKey}`, ...(apiVersion ? { 'stripe-version': apiVersion } : {}), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
        body: form ? new URLSearchParams(form).toString() : undefined,
      });
    } catch (error) { reportIntegrationFailure('stripe', error, { kind: 'network' }); throw new BillingProviderError('The payment provider could not be reached. Try again shortly.', true); }
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (response.ok && body) return body;
    reportIntegrationFailure('stripe', new Error(`Stripe answered ${response.status}`), { status: response.status });
    if (response.status === 401 || response.status === 403) throw new BillingProviderError('The payment provider rejected the API key. Check STRIPE_SECRET_KEY.');
    if (response.status === 429 || response.status >= 500) throw new BillingProviderError('The payment provider is busy. Try again shortly.', true);
    const message = (body?.error as { message?: string } | undefined)?.message;
    throw new BillingProviderError(`The payment provider refused the request${message ? `: ${message.slice(0, 160)}` : '.'}`);
  }

  async createCheckout(input: { priceId: string; quantity: number; workspaceId: string; planKey: string; customerId?: string; customerEmail?: string; successUrl: string; cancelUrl: string }): Promise<string> {
    const form: Record<string, string> = {
      mode: 'subscription', 'line_items[0][price]': input.priceId, 'line_items[0][quantity]': String(input.quantity),
      client_reference_id: input.workspaceId, 'metadata[workspaceId]': input.workspaceId, 'metadata[plan]': input.planKey,
      'subscription_data[metadata][workspaceId]': input.workspaceId, 'subscription_data[metadata][plan]': input.planKey,
      success_url: input.successUrl, cancel_url: input.cancelUrl,
    };
    if (input.customerId) form.customer = input.customerId; else if (input.customerEmail) form.customer_email = input.customerEmail;
    if (this.settings.managedPayments) form['managed_payments[enabled]'] = 'true';
    const session = await this.request('POST', '/v1/checkout/sessions', form, this.settings.managedPayments ? MANAGED_PAYMENTS_VERSION : undefined);
    if (typeof session.url !== 'string') throw new BillingProviderError('The payment provider did not return a checkout address.');
    return session.url;
  }

  /** What Stripe holds for a price, so AVEN can check it against the price it advertises before sending anyone to pay. */
  async getPrice(priceId: string): Promise<{ active: boolean; currency: string; unitAmount: number | null; interval: string | null; usageType: string | null }> {
    const price = await this.request('GET', `/v1/prices/${encodeURIComponent(priceId)}`);
    const recurring = price.recurring as { interval?: string; usage_type?: string } | null | undefined;
    return { active: price.active === true, currency: String(price.currency ?? ''), unitAmount: typeof price.unit_amount === 'number' ? price.unit_amount : null, interval: recurring?.interval ?? null, usageType: recurring?.usage_type ?? null };
  }

  async createPortal(customerId: string, returnUrl: string): Promise<string> {
    const session = await this.request('POST', '/v1/billing_portal/sessions', { customer: customerId, return_url: returnUrl });
    if (typeof session.url !== 'string') throw new BillingProviderError('The payment provider did not return a billing portal address.');
    return session.url;
  }

  /** Sets the seat count on a subscription's first item. Stripe prorates the change. */
  async setQuantity(subscriptionId: string, quantity: number): Promise<void> {
    const subscription = await this.request('GET', `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
    const item = ((subscription.items as { data?: Array<{ id?: string }> } | undefined)?.data ?? [])[0];
    if (!item?.id) throw new BillingProviderError('The subscription has no items to update.');
    await this.request('POST', `/v1/subscription_items/${encodeURIComponent(item.id)}`, { quantity: String(quantity), proration_behavior: 'create_prorations' });
  }

  /**
   * Creates a subscription product with its monthly default price and the Managed Payments tax code. Returns the product and the price id
   * to put in STRIPE_PRICE_<PLAN>. Used by the setup script (`npm run billing:create-plan-products`), never at request time.
   */
  async createPlanProduct(input: { name: string; planKey: string; currency: string; unitAmount: number }): Promise<{ productId: string; priceId: string }> {
    const product = await this.request('POST', '/v1/products', {
      name: input.name, tax_code: MANAGED_PAYMENTS_TAX_CODE, 'metadata[plan]': input.planKey,
      'default_price_data[currency]': input.currency, 'default_price_data[unit_amount]': String(input.unitAmount), 'default_price_data[recurring][interval]': 'month',
    }, MANAGED_PAYMENTS_VERSION);
    const priceId = typeof product.default_price === 'string' ? product.default_price : (product.default_price as { id?: string } | undefined)?.id;
    if (typeof product.id !== 'string' || !priceId) throw new BillingProviderError('The payment provider did not return the new product and price.');
    return { productId: product.id, priceId };
  }
}
