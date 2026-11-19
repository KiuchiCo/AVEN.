import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { readApiEnvironment } from '../config/api-environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { renderNotificationEmail, notificationHref, type NotificationItem } from './email-templates.js';
import { MailError, MAILER, type OptionalMailer } from './mailer.js';

const TICK_MS = 60_000;
const BATCH_WINDOW_MS = 5 * 60_000;
const STALE_AFTER_MS = 7 * 24 * 3_600_000;
const MAX_USERS_PER_TICK = 50;

/**
 * Emails members a summary of the notifications addressed to them (mentions, assignments, followed tasks).
 * It waits a few minutes first so you can read things in the app, skips anything already read or dismissed,
 * never emails a backlog from before email was switched on, and sends at most one email per person per pass.
 */
@Injectable()
export class NotificationEmailer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Email');
  private timer?: NodeJS.Timeout;
  private ticking = false;
  private readonly retryAfter = new Map<string, number>();

  constructor(private readonly prisma: PrismaService, @Inject(MAILER) private readonly mailer: OptionalMailer) {}

  onModuleInit() {
    if (!this.mailer || process.env.EMAIL_DISABLED === 'true' || process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => { void this.tick().catch((error) => this.logger.error(`Email pass failed: ${error instanceof Error ? error.message : error}`)); }, TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick(now = new Date(), batchWindowMs = BATCH_WINDOW_MS): Promise<{ emails: number; skipped: number }> {
    const result = { emails: 0, skipped: 0 };
    if (!this.mailer || this.ticking) return result;
    this.ticking = true;
    try {
      const pending = await this.prisma.activityReceipt.findMany({
        where: { isNotificationTarget: true, emailedAt: null, readAt: null, dismissedAt: null, createdAt: { lte: new Date(now.getTime() - batchWindowMs) }, user: { emailNotifications: true, notifyTaskUpdates: true } },
        orderBy: { createdAt: 'asc' }, take: 500,
        select: { id: true, userId: true, createdAt: true, user: { select: { email: true, displayName: true, emailEnabledAt: true } }, activity: { select: { workspaceId: true, entityType: true, entityId: true, message: true, actorId: true, actor: { select: { displayName: true } }, workspace: { select: { name: true } } } } },
      });
      if (!pending.length) return result;

      const memberships = await this.prisma.workspaceMember.findMany({ where: { OR: [...new Map(pending.map((r) => [`${r.activity.workspaceId}:${r.userId}`, { workspaceId: r.activity.workspaceId, userId: r.userId }])).values()] }, select: { workspaceId: true, userId: true } });
      const member = new Set(memberships.map((m) => `${m.workspaceId}:${m.userId}`));
      const eligible = pending.filter((r) =>
        (!r.user.emailEnabledAt || r.createdAt >= r.user.emailEnabledAt)
        && now.getTime() - r.createdAt.getTime() <= STALE_AFTER_MS
        && member.has(`${r.activity.workspaceId}:${r.userId}`)
        && (r.activity.actorId !== r.userId || r.activity.entityType === 'WORKFLOW'));
      const eligibleIds = new Set(eligible.map((r) => r.id));
      // Anything that will never be emailed is marked handled so it doesn't crowd out newer notifications.
      const skipped = pending.filter((r) => !eligibleIds.has(r.id)).map((r) => r.id);
      if (skipped.length) { await this.prisma.activityReceipt.updateMany({ where: { id: { in: skipped }, emailedAt: null }, data: { emailedAt: now } }); result.skipped = skipped.length; }

      const byUser = new Map<string, typeof eligible>();
      for (const receipt of eligible) byUser.set(receipt.userId, [...(byUser.get(receipt.userId) ?? []), receipt]);
      const { webBaseUrl } = readApiEnvironment();
      for (const [userId, receipts] of [...byUser].slice(0, MAX_USERS_PER_TICK)) {
        if ((this.retryAfter.get(userId) ?? 0) > now.getTime()) continue;
        // Claim first, so a second instance cannot send the same notifications.
        const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>`UPDATE activity_receipts SET "emailedAt" = ${now} WHERE id::text = ANY(${receipts.map((r) => r.id)}) AND "emailedAt" IS NULL RETURNING id`;
        const claimedIds = new Set(claimed.map((row) => row.id));
        const mine = receipts.filter((r) => claimedIds.has(r.id));
        if (!mine.length) continue;
        const items: NotificationItem[] = mine.map((r) => ({ workspaceName: r.activity.workspace.name, actorName: r.activity.actor.displayName, message: r.activity.message, href: notificationHref(r.activity.entityType, r.activity.entityId), createdAt: r.createdAt }));
        try {
          await this.mailer.send({ to: mine[0].user.email, ...renderNotificationEmail({ recipientName: mine[0].user.displayName, items, webBaseUrl }) });
          this.retryAfter.delete(userId);
          result.emails += 1;
        } catch (error) {
          await this.prisma.activityReceipt.updateMany({ where: { id: { in: mine.map((r) => r.id) } }, data: { emailedAt: null } });
          const retry = error instanceof MailError ? error.retry : true;
          this.retryAfter.set(userId, now.getTime() + (retry ? 15 * 60_000 : 60 * 60_000));
          this.logger.warn(`Could not email notifications to user ${userId}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
      }
      return result;
    } finally { this.ticking = false; }
  }
}
