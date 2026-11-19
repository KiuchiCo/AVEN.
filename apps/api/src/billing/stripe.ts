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

type Settings = { secretKey: string; baseUrl: string };

/** The few Stripe calls AVEN needs, over plain fetch. Plan changes, cancellation and payment methods happen in Stripe's own billing portal. */
export class StripeClient {
  constructor(private readonly settings: Settings) {}

  private async request(method: 'GET' | 'POST', path: string, form?: Record<string, string>): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(`${this.settings.baseUrl.replace(/\/$/, '')}${path}`, {
        method, signal: AbortSignal.timeout(20_000),
        headers: { authorization: `Bearer ${this.settings.secretKey}`, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
        body: form ? new URLSearchParams(form).toString() : undefined,
      });
    } catch { throw new BillingProviderError('The payment provider could not be reached. Try again shortly.', true); }
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (response.ok && body) return body;
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
    const session = await this.request('POST', '/v1/checkout/sessions', form);
    if (typeof session.url !== 'string') throw new BillingProviderError('The payment provider did not return a checkout address.');
    return session.url;
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
}
