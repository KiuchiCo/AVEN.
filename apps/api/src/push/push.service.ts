import { reportIntegrationFailure, reportJobFailure } from '../observability/error-reporter.js';
import { BadRequestException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { notificationHref } from '../email/email-templates.js';
import { sendWebhook, WebhookError } from '../workflows/webhook.js';
import { encryptPayload, vapidAuthorization, type VapidKeys } from './push-crypto.js';
import { MAX_SUBSCRIPTIONS_PER_USER, parseEndpoint, parseSubscription, pushMessage } from './push-rules.js';
import { APNS, PUSH_SETTINGS, type PushSettings } from './tokens.js';
import { apnsPayload, isDeadToken, type ApnsClient } from './apns.js';

const MAX_DEVICES_PER_USER = 10;

const TICK_MS = 15_000;
const FRESH_MS = 10 * 60_000;

/** Browser push: a member's subscriptions, and sending them the notifications that would otherwise wait in the Inbox. */
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Push');
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(private readonly prisma: PrismaService, @Inject(PUSH_SETTINGS) private readonly settings: PushSettings | null, @Optional() @Inject(APNS) private readonly apns: ApnsClient | null = null) {}

  onModuleInit() {
    if ((!this.settings && !this.apns) || process.env.NODE_ENV === 'test' || process.env.PUSH_DISABLED === 'true') return;
    this.timer = setInterval(() => { void this.tick().catch((error) => { reportJobFailure('push', error); this.logger.error(`Push pass failed: ${error instanceof Error ? error.message : error}`); }); }, TICK_MS);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  config() { return { enabled: Boolean(this.settings), publicKey: this.settings?.publicKey ?? null, native: Boolean(this.apns) }; }

  private async userId(identity: AuthenticatedIdentity) {
    const user = await this.prisma.user.findUnique({ where: { identityIssuer_identitySubject: { identityIssuer: identity.issuer, identitySubject: identity.subject } }, select: { id: true } });
    if (!user) throw new BadRequestException('Your AVEN account is not set up yet.');
    return user.id;
  }

  async subscribe(identity: AuthenticatedIdentity, input: unknown) {
    if (!this.settings) throw new BadRequestException('Push notifications are not set up for this installation.');
    const userId = await this.userId(identity);
    const subscription = parseSubscription(input, this.settings.allowPrivate);
    const existing = await this.prisma.pushSubscription.findUnique({ where: { endpoint: subscription.endpoint }, select: { userId: true } });
    if (!existing && await this.prisma.pushSubscription.count({ where: { userId } }) >= MAX_SUBSCRIPTIONS_PER_USER) throw new BadRequestException(`You can have up to ${MAX_SUBSCRIPTIONS_PER_USER} devices subscribed. Remove one first.`);
    // An endpoint belongs to one person: re-subscribing on a shared browser moves it to whoever is signed in now.
    await this.prisma.pushSubscription.upsert({ where: { endpoint: subscription.endpoint }, create: { userId, ...subscription }, update: { userId, p256dh: subscription.p256dh, auth: subscription.auth } });
    return { subscribed: true };
  }

  async unsubscribe(identity: AuthenticatedIdentity, input: unknown) {
    const userId = await this.userId(identity);
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint: parseEndpoint(input) } });
    return { subscribed: false };
  }

  /** A test notification to the signed-in person's own browser subscriptions only, with fixed generic text. Dead subscriptions found on the way are removed. */
  async sendTest(identity: AuthenticatedIdentity) {
    if (!this.settings) throw new BadRequestException('Push notifications are not set up for this installation.');
    const userId = await this.userId(identity);
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (!subscriptions.length) throw new BadRequestException('This account has no device subscribed. Turn notifications on first.');
    const { webBaseUrl } = readApiEnvironment();
    const payload = Buffer.from(JSON.stringify({ title: 'AVEN.', body: 'This is a test notification. Notifications are working on this device.', url: `${webBaseUrl}/workspace/settings` }));
    const result = { sent: 0, removed: 0, failed: 0 };
    for (const subscription of subscriptions) {
      try { await this.deliver(subscription, payload, new Date()); result.sent += 1; }
      catch (error) {
        if (error instanceof WebhookError && (error.status === 404 || error.status === 410)) { await this.prisma.pushSubscription.deleteMany({ where: { id: subscription.id } }); result.removed += 1; }
        else { reportIntegrationFailure('push', error); result.failed += 1; }
      }
    }
    return result;
  }

  /** The iPhone or iPad app registers (or re-registers) its notification token for the signed-in person. A token belongs to one person: signing in as someone else on the same device moves it. */
  async registerDevice(identity: AuthenticatedIdentity, input: unknown) {
    const userId = await this.userId(identity);
    const body = input && typeof input === 'object' && !Array.isArray(input) ? input as { token?: unknown; environment?: unknown } : {};
    const token = typeof body.token === 'string' ? body.token.trim().toLowerCase() : '';
    if (!/^[0-9a-f]{32,200}$/.test(token)) throw new BadRequestException('That is not a valid device token.');
    const environment = body.environment === 'development' ? 'development' : 'production';
    const existing = await this.prisma.nativePushDevice.findUnique({ where: { token }, select: { userId: true } });
    if (!existing && await this.prisma.nativePushDevice.count({ where: { userId } }) >= MAX_DEVICES_PER_USER) throw new BadRequestException(`You can have up to ${MAX_DEVICES_PER_USER} devices receiving notifications. Remove one first.`);
    await this.prisma.nativePushDevice.upsert({ where: { token }, create: { userId, token, environment }, update: { userId, environment } });
    return { registered: true };
  }

  async removeDevice(identity: AuthenticatedIdentity, input: unknown) {
    const userId = await this.userId(identity);
    const token = this.tokenOf(input);
    await this.prisma.nativePushDevice.deleteMany({ where: { userId, token } });
    return { registered: false };
  }

  /** See PushDeviceUnregisterController: the token itself is the proof. */
  async unregisterDevice(input: unknown) {
    await this.prisma.nativePushDevice.deleteMany({ where: { token: this.tokenOf(input) } });
    return { registered: false };
  }

  private tokenOf(input: unknown) {
    const token = input && typeof input === 'object' && !Array.isArray(input) && typeof (input as { token?: unknown }).token === 'string' ? (input as { token: string }).token.trim().toLowerCase() : '';
    if (!/^[0-9a-f]{32,200}$/.test(token)) throw new BadRequestException('That is not a valid device token.');
    return token;
  }

  /** Sends each person with a subscription one push for their newest unread notifications. */
  async tick(now = new Date()): Promise<{ pushes: number; removed: number }> {
    const result = { pushes: 0, removed: 0 };
    if ((!this.settings && !this.apns) || this.ticking) return result;
    this.ticking = true;
    try {
      const pending = await this.prisma.activityReceipt.findMany({
        where: { isNotificationTarget: true, pushedAt: null, readAt: null, dismissedAt: null, createdAt: { gte: new Date(now.getTime() - FRESH_MS) }, user: { notifyTaskUpdates: true, OR: [...(this.settings ? [{ pushSubscriptions: { some: {} } }] : []), ...(this.apns ? [{ nativePushDevices: { some: {} } }] : [])] } },
        orderBy: { createdAt: 'asc' }, take: 300,
        select: { id: true, userId: true, activity: { select: { actorId: true, entityType: true, entityId: true, message: true, actor: { select: { displayName: true } }, workspace: { select: { name: true } } } } },
      });
      if (!pending.length) return result;
      const { webBaseUrl } = readApiEnvironment();
      const byUser = new Map<string, typeof pending>();
      for (const receipt of pending) byUser.set(receipt.userId, [...(byUser.get(receipt.userId) ?? []), receipt]);
      for (const [userId, receipts] of byUser) {
        const claimed = await this.prisma.activityReceipt.updateMany({ where: { id: { in: receipts.map((r) => r.id) }, pushedAt: null }, data: { pushedAt: now } });
        if (!claimed.count) continue;
        const mine = receipts.filter((r) => r.activity.actorId !== userId || r.activity.entityType === 'WORKFLOW');
        if (!mine.length) continue;
        const message = pushMessage(mine.map((r) => ({ actorName: r.activity.actor.displayName, message: r.activity.message, workspaceName: r.activity.workspace.name, href: notificationHref(r.activity.entityType, r.activity.entityId) })), webBaseUrl);
        const payload = Buffer.from(JSON.stringify(message));
        // iPhones and iPads: through Apple. The tap opens the same screen the browser notification would.
        if (this.apns) {
          const devices = await this.prisma.nativePushDevice.findMany({ where: { userId } });
          for (const device of devices) {
            const sent = await this.apns.send(device.token, device.environment === 'development' ? 'development' : 'production', apnsPayload({ title: message.title, body: message.body, path: message.url.replace(webBaseUrl, '') || '/workspace/inbox', thread: message.title }));
            if (sent.status === 200) { result.pushes += 1; }
            else if (isDeadToken(sent)) { await this.prisma.nativePushDevice.deleteMany({ where: { id: device.id } }); result.removed += 1; }
            else { reportIntegrationFailure('apns', new Error(`APNs answered ${sent.status} ${sent.reason ?? ''}`.trim()), { status: sent.status }); }
          }
        }
        const subscriptions = this.settings ? await this.prisma.pushSubscription.findMany({ where: { userId } }) : [];
        for (const subscription of subscriptions) {
          try { await this.deliver(subscription, payload, now); result.pushes += 1; }
          catch (error) {
            if (error instanceof WebhookError && (error.status === 404 || error.status === 410)) { await this.prisma.pushSubscription.deleteMany({ where: { id: subscription.id } }); result.removed += 1; }
            else { reportIntegrationFailure('push', error); this.logger.warn(`Could not push to a device of user ${userId}: ${error instanceof Error ? error.message : 'unknown error'}`); }
          }
        }
      }
      return result;
    } finally { this.ticking = false; }
  }

  private deliver(subscription: { endpoint: string; p256dh: string; auth: string }, payload: Buffer, now: Date) {
    const settings = this.settings!;
    const keys: VapidKeys = { publicKey: settings.publicKey, privateKey: settings.privateKey };
    return sendWebhook(new URL(subscription.endpoint), encryptPayload(payload, subscription), {
      allowPrivate: settings.allowPrivate, userAgent: 'AVEN-Push/1.0',
      headers: { 'content-type': 'application/octet-stream', 'content-encoding': 'aes128gcm', ttl: '600', urgency: 'normal', authorization: vapidAuthorization(subscription.endpoint, keys, settings.subject, now) },
    });
  }
}
