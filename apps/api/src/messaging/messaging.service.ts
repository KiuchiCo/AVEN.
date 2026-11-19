import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { PrismaService } from '../database/prisma.service.js';
import { ChannelEvents } from './channel-events.js';
import { extractMentionIds, messageLimits, parseBefore, parseChannelName, parseMessageBody, parseTopic } from './message-rules.js';

const messageSelect = { id: true, channelId: true, body: true, createdAt: true, editedAt: true, deletedAt: true, author: { select: { id: true, displayName: true } } } as const;
const channelSelect = { id: true, name: true, topic: true, createdAt: true } as const;
const object = (input: unknown) => { if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('A JSON object is required.'); return input as Record<string, unknown>; };

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService, private readonly events: ChannelEvents) {}

  private async role(userId: string, workspaceId: string) {
    return (await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } }))?.role;
  }

  private async channel(workspaceId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, workspaceId }, select: channelSelect });
    if (!channel) throw new NotFoundException('Channel not found in this workspace.');
    return channel;
  }

  async list(identity: AuthenticatedIdentity, workspaceId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const [channels, unread] = await Promise.all([
      this.prisma.channel.findMany({ where: { workspaceId }, orderBy: { name: 'asc' }, select: channelSelect }),
      this.prisma.$queryRaw<{ channelId: string; count: number }[]>`
        SELECT m."channelId", count(*)::int AS count FROM channel_messages m
        JOIN channels c ON c.id = m."channelId"
        LEFT JOIN channel_reads r ON r."channelId" = c.id AND r."userId" = ${userId}::uuid
        WHERE c."workspaceId" = ${workspaceId}::uuid AND m."deletedAt" IS NULL AND m."authorId" <> ${userId}::uuid AND m."createdAt" > COALESCE(r."lastReadAt", c."createdAt")
        GROUP BY m."channelId"`,
    ]);
    const counts = new Map(unread.map((row) => [row.channelId, row.count]));
    return channels.map((channel) => ({ ...channel, unread: counts.get(channel.id) ?? 0 }));
  }

  async createChannel(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const body = object(input);
    const name = parseChannelName(body.name); const topic = parseTopic(body.topic);
    if (await this.prisma.channel.count({ where: { workspaceId } }) >= messageLimits.channels) throw new BadRequestException(`A workspace can have up to ${messageLimits.channels} channels.`);
    try {
      const channel = await this.prisma.channel.create({ data: { workspaceId, createdById: userId, name, topic }, select: channelSelect });
      this.events.publish(workspaceId, { type: 'channel', channel: { ...channel, unread: 0 } });
      return { ...channel, unread: 0 };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException(`There is already a channel called #${name}.`);
      throw error;
    }
  }

  /** Newest first in pages, so the client can show the latest and load earlier ones on request. */
  async messages(identity: AuthenticatedIdentity, workspaceId: string, channelId: string, query: { before?: string }) {
    await requireWorkspaceMember(this.prisma, identity, workspaceId);
    await this.channel(workspaceId, channelId);
    const before = parseBefore(query.before);
    const rows = await this.prisma.channelMessage.findMany({ where: { channelId, workspaceId, ...(before ? { createdAt: { lt: before } } : {}) }, orderBy: { createdAt: 'desc' }, take: messageLimits.page + 1, select: messageSelect });
    return { messages: rows.slice(0, messageLimits.page).reverse(), hasMore: rows.length > messageLimits.page };
  }

  async send(identity: AuthenticatedIdentity, workspaceId: string, channelId: string, input: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const channel = await this.channel(workspaceId, channelId);
    const body = parseMessageBody(object(input).body);
    const message = await this.prisma.channelMessage.create({ data: { channelId, workspaceId, authorId: userId, body }, select: messageSelect });
    await this.markRead(userId, channelId);
    await this.notifyMentions(workspaceId, userId, channel.name, channelId, extractMentionIds(body));
    this.events.publish(workspaceId, { type: 'message', channelId, message });
    return message;
  }

  async edit(identity: AuthenticatedIdentity, workspaceId: string, channelId: string, messageId: string, input: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const body = parseMessageBody(object(input).body);
    const previous = await this.prisma.channelMessage.findFirst({ where: { id: messageId, channelId, workspaceId, authorId: userId, deletedAt: null }, select: { body: true } });
    if (!previous) throw new NotFoundException('You can only edit your own messages.');
    const result = await this.prisma.channelMessage.updateMany({ where: { id: messageId, channelId, workspaceId, authorId: userId, deletedAt: null }, data: { body, editedAt: new Date() } });
    if (result.count !== 1) throw new NotFoundException('You can only edit your own messages.');
    // Only people newly mentioned by the edit are told, so fixing a typo never pings anyone twice.
    const already = new Set(extractMentionIds(previous.body));
    const channel = await this.channel(workspaceId, channelId);
    await this.notifyMentions(workspaceId, userId, channel.name, channelId, extractMentionIds(body).filter((id) => !already.has(id)));
    const message = await this.prisma.channelMessage.findUniqueOrThrow({ where: { id: messageId }, select: messageSelect });
    this.events.publish(workspaceId, { type: 'message_updated', channelId, message });
    return message;
  }

  /** The author can delete their message. Owners and administrators can delete anyone's. */
  async remove(identity: AuthenticatedIdentity, workspaceId: string, channelId: string, messageId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const message = await this.prisma.channelMessage.findFirst({ where: { id: messageId, channelId, workspaceId, deletedAt: null }, select: { authorId: true } });
    if (!message) throw new NotFoundException('Message not found.');
    if (message.authorId !== userId && !['OWNER', 'ADMINISTRATOR'].includes((await this.role(userId, workspaceId)) ?? '')) throw new ForbiddenException('You can only delete your own messages.');
    await this.prisma.channelMessage.update({ where: { id: messageId }, data: { body: '', deletedAt: new Date() } });
    this.events.publish(workspaceId, { type: 'message_deleted', channelId, id: messageId });
    return { id: messageId, deleted: true };
  }

  /** Mentioned workspace members (not the author) get an Inbox notification that opens Messages. Non-members are ignored. */
  private async notifyMentions(workspaceId: string, actorId: string, channelName: string, channelId: string, ids: string[]) {
    const targets = ids.filter((id) => id !== actorId);
    if (!targets.length) return;
    const members = await this.prisma.workspaceMember.findMany({ where: { workspaceId, userId: { in: targets } }, select: { userId: true } });
    if (!members.length) return;
    await this.prisma.$transaction(async (transaction) => {
      const activity = await transaction.workspaceActivity.create({ data: { workspaceId, actorId, entityType: 'CHANNEL', entityId: channelId, message: `mentioned you in #${channelName}`, recipientScoped: true } });
      await transaction.activityReceipt.createMany({ data: members.map((member) => ({ activityId: activity.id, userId: member.userId, isNotificationTarget: true })), skipDuplicates: true });
    });
  }

  private markRead(userId: string, channelId: string) {
    const now = new Date();
    return this.prisma.channelRead.upsert({ where: { channelId_userId: { channelId, userId } }, create: { channelId, userId, lastReadAt: now }, update: { lastReadAt: now } });
  }

  async read(identity: AuthenticatedIdentity, workspaceId: string, channelId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    await this.channel(workspaceId, channelId);
    await this.markRead(userId, channelId);
    return { read: true };
  }

  /** Called once when a live connection opens, so a non-member never gets a stream. */
  async openStream(identity: AuthenticatedIdentity, workspaceId: string) {
    return requireWorkspaceMember(this.prisma, identity, workspaceId);
  }
}
