import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { EntitlementsService } from './entitlements.service.js';
import { planKeys, type PlanKey } from './plans.js';
import { BillingProviderError, StripeClient } from './stripe.js';

export const STRIPE = Symbol('STRIPE');
export type OptionalStripe = StripeClient | null;

type StripeObject = Record<string, any>;
export type StripeEvent = { id: string; type: string; data: { object: StripeObject } };

const unix = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000) : null);
const knownStatus = (status: unknown) => (typeof status === 'string' ? status.toUpperCase().replace(/-/g, '_').slice(0, 20) : 'INCOMPLETE');

@Injectable()
export class BillingService {
  private readonly logger = new Logger('Billing');

  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementsService, @Inject(STRIPE) private readonly stripe: OptionalStripe) {}

  // ---- the account page ------------------------------------------------------------------------------------

  async overview(identity: AuthenticatedIdentity, workspaceId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const [entitlements, usage, subscription, invoices, role] = await Promise.all([
      this.entitlements.forWorkspace(workspaceId), this.entitlements.usage(workspaceId),
      this.prisma.subscription.findUnique({ where: { workspaceId } }),
      this.prisma.billingInvoice.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, number: true, status: true, amountCents: true, currency: true, hostedUrl: true, createdAt: true } }),
      this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } }),
    ]);
    const { stripePrices } = readApiEnvironment();
    const catalog = Object.values(this.entitlements.catalog());
    return {
      plan: { key: entitlements.planKey, name: entitlements.plan.name, priceCents: entitlements.plan.priceCents, perSeat: entitlements.plan.perSeat },
      status: subscription && entitlements.planKey !== 'FREE' ? subscription.status : 'FREE',
      subscriptionStatus: subscription?.status ?? null,
      seats: entitlements.seats, currentPeriodEnd: subscription?.currentPeriodEnd ?? null, cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      limits: entitlements.limits, usage, features: [...entitlements.features],
      providerConfigured: this.stripe !== null, canManage: role?.role === 'OWNER', hasBillingAccount: Boolean(subscription?.providerCustomerId),
      plans: catalog.map((plan) => ({ key: plan.key, name: plan.name, tagline: plan.tagline, priceCents: plan.priceCents, currency: plan.currency, perSeat: plan.perSeat, selfServe: plan.selfServe, limits: plan.limits, perSeatLimits: plan.perSeatLimits ?? null, features: plan.features, purchasable: this.stripe !== null && plan.selfServe && Boolean(stripePrices[plan.key as 'PLUS']) })),
      invoices,
    };
  }

  private async owner(identity: AuthenticatedIdentity, workspaceId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const membership = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true, user: { select: { email: true } } } });
    if (membership?.role !== 'OWNER') throw new ForbiddenException('Only the workspace owner can manage billing.');
    return { userId, email: membership.user.email };
  }

  private requireProvider(): StripeClient {
    if (!this.stripe) throw new ServiceUnavailableException('Payments aren’t set up for this AVEN installation yet, so plans can’t be changed here. The owner needs to add the payment provider keys.');
    return this.stripe;
  }

  private wrap<T>(action: () => Promise<T>): Promise<T> {
    return action().catch((error) => { if (error instanceof BillingProviderError) throw error.retry ? new ServiceUnavailableException(error.message) : new BadRequestException(error.message); throw error; });
  }

  // ---- changing plan ---------------------------------------------------------------------------------------

  /** Starts a Stripe Checkout for a new subscription. Changes to an existing subscription go through the portal. */
  async checkout(identity: AuthenticatedIdentity, workspaceId: string, body: unknown) {
    const { email } = await this.owner(identity, workspaceId);
    const stripe = this.requireProvider();
    const planKey = body && typeof body === 'object' ? (body as { plan?: unknown }).plan : undefined;
    const plan = typeof planKey === 'string' && planKeys.includes(planKey as PlanKey) ? this.entitlements.catalog()[planKey as PlanKey] : null;
    if (!plan) throw new BadRequestException('Choose a plan.');
    if (!plan.selfServe) throw new BadRequestException(plan.key === 'ENTERPRISE' ? 'Enterprise plans are arranged directly rather than bought here.' : 'That plan can’t be purchased.');
    const { stripePrices, webBaseUrl } = readApiEnvironment();
    const priceId = stripePrices[plan.key as 'PLUS'];
    if (!priceId) throw new ServiceUnavailableException(`The ${plan.name} plan isn’t available to buy yet: its price hasn’t been set up with the payment provider.`);
    const current = await this.entitlements.forWorkspace(workspaceId);
    const subscription = await this.prisma.subscription.findUnique({ where: { workspaceId } });
    if (subscription?.providerSubscriptionId && current.planKey !== 'FREE') throw new ConflictException('This workspace already has a subscription. Use “Manage billing” to change or cancel it.');
    const seats = plan.perSeat ? Math.max(1, await this.entitlements.memberCount(workspaceId)) : 1;
    const base = webBaseUrl.replace(/\/$/, '');
    const url = await this.wrap(() => stripe.createCheckout({ priceId, quantity: seats, workspaceId, planKey: plan.key, customerId: subscription?.providerCustomerId ?? undefined, customerEmail: email, successUrl: `${base}/workspace/settings?billing=success`, cancelUrl: `${base}/workspace/settings?billing=cancelled` }));
    return { url };
  }

  async portal(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.owner(identity, workspaceId);
    const stripe = this.requireProvider();
    const subscription = await this.prisma.subscription.findUnique({ where: { workspaceId }, select: { providerCustomerId: true } });
    if (!subscription?.providerCustomerId) throw new BadRequestException('This workspace has no billing account yet. Choose a plan first.');
    const url = await this.wrap(() => stripe.createPortal(subscription.providerCustomerId!, `${readApiEnvironment().webBaseUrl.replace(/\/$/, '')}/workspace/settings`));
    return { url };
  }

  /** Per-seat plans bill for each person except Guests. Called when people join or leave, and by the owner on demand. */
  async syncSeats(workspaceId: string): Promise<{ seats: number; changed: boolean }> {
    const subscription = await this.prisma.subscription.findUnique({ where: { workspaceId } });
    const catalog = this.entitlements.catalog();
    if (!this.stripe || !subscription?.providerSubscriptionId || !catalog[subscription.planKey as PlanKey]?.perSeat) return { seats: subscription?.seats ?? 1, changed: false };
    const wanted = Math.max(1, await this.entitlements.memberCount(workspaceId));
    if (wanted === subscription.seats) return { seats: wanted, changed: false };
    await this.wrap(() => this.stripe!.setQuantity(subscription.providerSubscriptionId!, wanted));
    await this.prisma.subscription.update({ where: { workspaceId }, data: { seats: wanted } });
    return { seats: wanted, changed: true };
  }

  async syncSeatsAsOwner(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.owner(identity, workspaceId);
    this.requireProvider();
    return this.syncSeats(workspaceId);
  }

  /** Best effort, for use after membership changes: a billing hiccup must never block adding or removing a person. */
  async syncSeatsQuietly(workspaceId: string) {
    try { await this.syncSeats(workspaceId); } catch (error) { this.logger.warn(`Could not update billed seats: ${error instanceof Error ? error.message : 'unknown error'}`); }
  }

  // ---- webhooks --------------------------------------------------------------------------------------------

  /**
   * Applies one verified provider event. Each event id is recorded in the same transaction as its effect, so a
   * repeated delivery changes nothing and a failed one is simply retried by the provider.
   */
  async handleEvent(event: StripeEvent): Promise<{ result: 'applied' | 'duplicate' | 'ignored' }> {
    if (!event || typeof event.id !== 'string' || typeof event.type !== 'string' || !event.data?.object) throw new BadRequestException('Not a valid event.');
    if (await this.prisma.billingEvent.findUnique({ where: { provider_providerEventId: { provider: 'stripe', providerEventId: event.id } }, select: { id: true } })) return { result: 'duplicate' };
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const workspaceId = await this.apply(transaction, event);
        await transaction.billingEvent.create({ data: { provider: 'stripe', providerEventId: event.id, type: event.type.slice(0, 80), workspaceId } });
        return { result: workspaceId ? 'applied' as const : 'ignored' as const };
      });
    } catch (error) {
      if ((error as { code?: unknown }).code === 'P2002') return { result: 'duplicate' };
      throw error;
    }
  }

  private planFromPrice(priceId: unknown): PlanKey | null {
    const { stripePrices } = readApiEnvironment();
    return (Object.entries(stripePrices).find(([, id]) => id === priceId)?.[0] as PlanKey | undefined) ?? null;
  }

  private async workspaceFor(transaction: Prisma.TransactionClient, object: StripeObject): Promise<string | null> {
    const claimed = object.metadata?.workspaceId ?? object.client_reference_id;
    if (typeof claimed === 'string' && /^[0-9a-f-]{36}$/i.test(claimed) && await transaction.workspace.findUnique({ where: { id: claimed }, select: { id: true } })) return claimed;
    const known = await transaction.subscription.findFirst({ where: { OR: [...(typeof object.id === 'string' && object.object === 'subscription' ? [{ providerSubscriptionId: object.id }] : []), ...(typeof object.customer === 'string' ? [{ providerCustomerId: object.customer }] : [])] }, select: { workspaceId: true } });
    return known?.workspaceId ?? null;
  }

  /** Returns the workspace the event changed, or null when it was not about one we know. */
  private async apply(transaction: Prisma.TransactionClient, event: StripeEvent): Promise<string | null> {
    const object = event.data.object;
    const customer = typeof object.customer === 'string' ? object.customer : null;
    switch (event.type) {
      case 'checkout.session.completed': {
        if (object.mode !== 'subscription') return null;
        const workspaceId = await this.workspaceFor(transaction, object); if (!workspaceId) return null;
        const planKey = typeof object.metadata?.plan === 'string' && planKeys.includes(object.metadata.plan) ? object.metadata.plan : null;
        const existing = await transaction.subscription.findUnique({ where: { workspaceId } });
        if (existing?.providerCustomerId && customer && existing.providerCustomerId !== customer) return null;
        const paid = object.payment_status === 'paid' || object.payment_status === 'no_payment_required';
        const data = { provider: 'stripe', providerCustomerId: customer, providerSubscriptionId: typeof object.subscription === 'string' ? object.subscription : null, ...(planKey ? { planKey } : {}) };
        await transaction.subscription.upsert({ where: { workspaceId }, create: { workspaceId, planKey: planKey ?? 'FREE', status: paid && planKey ? 'ACTIVE' : 'INCOMPLETE', seats: 1, ...data }, update: { ...data, ...(paid && planKey ? { status: 'ACTIVE' } : {}) } });
        return workspaceId;
      }
      case 'customer.subscription.created': case 'customer.subscription.updated': case 'customer.subscription.deleted': {
        const workspaceId = await this.workspaceFor(transaction, object); if (!workspaceId) return null;
        const existing = await transaction.subscription.findUnique({ where: { workspaceId } });
        if (existing?.providerCustomerId && customer && existing.providerCustomerId !== customer) return null;
        const item = object.items?.data?.[0];
        const planKey = this.planFromPrice(item?.price?.id) ?? (planKeys.includes(object.metadata?.plan) ? object.metadata.plan as PlanKey : null) ?? (existing?.planKey as PlanKey | undefined) ?? null;
        if (!planKey) return null;
        const deleted = event.type === 'customer.subscription.deleted';
        const quantity = Number.isInteger(item?.quantity) && item.quantity > 0 ? item.quantity : 1;
        const data = { planKey, status: deleted ? 'CANCELED' : knownStatus(object.status), seats: quantity, currentPeriodEnd: unix(object.current_period_end ?? item?.current_period_end), cancelAtPeriodEnd: !deleted && object.cancel_at_period_end === true, provider: 'stripe', providerCustomerId: customer ?? existing?.providerCustomerId ?? null, providerSubscriptionId: typeof object.id === 'string' ? object.id : existing?.providerSubscriptionId ?? null };
        await transaction.subscription.upsert({ where: { workspaceId }, create: { workspaceId, ...data }, update: data });
        return workspaceId;
      }
      case 'invoice.paid': case 'invoice.payment_failed': case 'invoice.finalized': case 'invoice.updated': case 'invoice.voided': {
        if (typeof object.id !== 'string' || object.status === 'draft' || !customer) return null;
        const subscription = await transaction.subscription.findFirst({ where: { providerCustomerId: customer }, select: { workspaceId: true } });
        if (!subscription) return null;
        const data = { number: typeof object.number === 'string' ? object.number.slice(0, 60) : null, status: knownStatus(object.status).toLowerCase(), amountCents: Number.isInteger(object.total) ? object.total : Number.isInteger(object.amount_due) ? object.amount_due : 0, currency: typeof object.currency === 'string' ? object.currency.slice(0, 3).toLowerCase() : 'aud', hostedUrl: typeof object.hosted_invoice_url === 'string' && /^https:\/\//.test(object.hosted_invoice_url) ? object.hosted_invoice_url.slice(0, 500) : null, periodStart: unix(object.period_start), periodEnd: unix(object.period_end) };
        await transaction.billingInvoice.upsert({ where: { providerInvoiceId: object.id }, create: { workspaceId: subscription.workspaceId, providerInvoiceId: object.id, createdAt: unix(object.created) ?? new Date(), ...data }, update: data });
        return subscription.workspaceId;
      }
      default: return null;
    }
  }
}
