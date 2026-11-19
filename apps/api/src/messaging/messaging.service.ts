import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ChannelEvents } from './channel-events.js';
import { directKey, extractMentionIds, messageLimits, parseBefore, parseChannelName, parseMessageBody, parseParentId, parseParticipants, parseSearchQuery, parseTopic } from './message-rules.js';

const authorSelect = { select: { id: true, displayName: true } } as const;
const messageSelect = { id: true, channelId: true, parentId: true, body: true, createdAt: true, editedAt: true, deletedAt: true, author: authorSelect, _count: { select: { replies: { where: { deletedAt: null } } } } } as const;
const channelSelect = { id: true, kind: true, name: true, topic: true, createdAt: true, members: { select: { user: authorSelect } } } as const;
const object = (input: unknown) => { if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('A JSON object is required.'); return input as Record<string, unknown>; };

type RawMessage = { id: string; channelId: string; parentId: string | null; body: string; createdAt: Date; editedAt: Date | null; deletedAt: Date | null; author: { id: string; displayName: string }; _count: { replies: number } };
const shape = ({ _count, ...message }: RawMessage) => ({ ...message, replyCount: _count.replies });
type RawChannel = { id: string; kind: 'CHANNEL' | 'DIRECT' | 'GROUP'; name: string | null; topic: string; createdAt: Date; members: { user: { id: string; displayName: string } }[] };
const shapeChannel = ({ members, ...channel }: RawChannel, unread = 0) => ({ ...channel, participants: channel.kind === 'CHANNEL' ? [] : members.map((member) => member.user), unread });

/** Public channels are open to every workspace member. Direct and group conversations only to the people in them. */
const visibleTo = (userId: string): Prisma.ChannelWhereInput => ({ OR: [{ kind: 'CHANNEL' }, { members: { some: { userId } } }] });

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService, private readonly events: ChannelEvents) {}

  private async role(userId: string, workspaceId: string) {
    return (await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } }))?.role;
  }

  /** Someone who can't see a conversation gets the same "not found" as one that doesn't exist. */
  private async channel(workspaceId: string, channelId: string, userId: string) {
    const channel = await this.prisma.channel.findFirst({ where: { id: channelId, workspaceId, ...visibleTo(userId) }, select: channelSelect });
    if (!channel) throw new NotFoundException('Conversation not found in this workspace.');
    return channel;
  }

  /** Who may hear events about this conversation: only its people when private. */
  private audience(channel: RawChannel): string[] | undefined {
    return channel.kind === 'CHANNEL' ? undefined : channel.members.map((member) => member.user.id);
  }

  async list(identity: AuthenticatedIdentity, workspaceId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const [channels, unread] = await Promise.all([
      this.prisma.channel.findMany({ where: { workspaceId, ...visibleTo(userId) }, orderBy: [{ kind: 'asc' }, { name: 'asc' }, { createdAt: 'asc' }], select: channelSelect }),
      this.prisma.$queryRaw<{ channelId: string; count: number }[]>`
        SELECT m."channelId", count(*)::int AS count FROM channel_messages m
        JOIN channels c ON c.id = m."channelId"
        LEFT JOIN channel_reads r ON r."channelId" = c.id AND r."userId" = ${userId}::uuid
        WHERE c."workspaceId" = ${workspaceId}::uuid AND m."deletedAt" IS NULL AND m."authorId" <> ${userId}::uuid AND m."createdAt" > COALESCE(r."lastReadAt", c."createdAt")
          AND (c.kind = 'CHANNEL' OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm."channelId" = c.id AND cm."userId" = ${userId}::uuid))
        GROUP BY m."channelId"`,
    ]);
    const counts = new Map(unread.map((row) => [row.channelId, row.count]));
    return channels.map((channel) => shapeChannel(channel, counts.get(channel.id) ?? 0));
  }

  async createChannel(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const body = object(input);
    const name = parseChannelName(body.name); const topic = parseTopic(body.topic);
    if (await this.prisma.channel.count({ where: { workspaceId, kind: 'CHANNEL' } }) >= messageLimits.channels) throw new BadRequestException(`A workspace can have up to ${messageLimits.channels} channels.`);
    try {
      const channel = shapeChannel(await this.prisma.channel.create({ data: { workspaceId, createdById: userId, name, topic }, select: channelSelect }));
      this.events.publish(workspaceId, { type: 'channel', channel });
      return channel;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException(`There is already a channel called #${name}.`);
      throw error;
    }
  }

  /** One other person makes a direct conversation (the same one every time); more make a group. Guests can't take part. */
  async startConversation(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const others = parseParticipants(object(input).userIds, userId);
    const members = await this.prisma.workspaceMember.findMany({ where: { workspaceId, userId: { in: others } }, select: { userId: true, role: true } });
    if (members.length !== others.length) throw new NotFoundException('One or more people are not in this workspace.');
    if (members.some((member) => member.role === 'GUEST')) throw new BadRequestException('Guests can read channels but can’t be part of conversations.');
    const direct = others.length === 1;
    const key = direct ? directKey(userId, others[0]) : null;
    if (direct) {
      const existing = await this.prisma.channel.findFirst({ where: { workspaceId, dmKey: key }, select: channelSelect });
      if (existing) return shapeChannel(existing);
    }
    try {
      const created = await this.prisma.channel.create({ data: { workspaceId, createdById: userId, kind: direct ? 'DIRECT' : 'GROUP', dmKey: key, members: { create: [userId, ...others].map((id) => ({ userId: id })) } }, select: channelSelect });
      const channel = shapeChannel(created);
      this.events.publish(workspaceId, { type: 'channel', channel }, this.audience(created));
      return channel;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002' && key) return shapeChannel((await this.prisma.channel.findFirstOrThrow({ where: { workspaceId, dmKey: key }, select: channelSelect })));
      throw error;
    }
  }

  /** The conversation's main thread, newest page first. Replies live under their message. */
  async messages(identity: AuthenticatedIdentity, workspaceId: string, channelId: string, query: { before?: string }) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    await this.channel(workspaceId, channelId, userId);
    const before = parseBefore(query.before);
    const rows = await this.prisma.channelMessage.findMany({ where: { channelId, workspaceId, parentId: null, ...(before ? { createdAt: { lt: before } } : {}) }, orderBy: { createdAt: 'desc' }, take: messageLimits.page + 1, select: messageSelect });
    return { messages: rows.slice(0, messageLimits.page).reverse().map(shape), hasMore: rows.length > messageLimits.page };
  }

  async replies(identity: AuthenticatedIdentity, workspaceId: string, channelId: string, messageId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    await this.channel(workspaceId, channelId, userId);
    const root = await this.prisma.channelMessage.findFirst({ where: { id: messageId, channelId, workspaceId, parentId: null }, select: messageSelect });
    if (!root) throw new NotFoundException('Message not found.');
    const rows = await this.prisma.channelMessage.findMany({ where: { parentId: messageId, channelId, workspaceId }, orderBy: { createdAt: 'asc' }, take: messageLimits.replies, select: messageSelect });
    return { root: shape(root), replies: rows.map(shape) };
  }

  async send(identity: AuthenticatedIdentity, workspaceId: string, channelId: string, input: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const channel = await this.channel(workspaceId, channelId, userId);
    const fields = object(input);
    const body = parseMessageBody(fields.body);
    const parentId = parseParentId(fields.parentId);
    if (parentId) {
      const parent = await this.prisma.channelMessage.findFirst({ where: { id: parentId, channelId, workspaceId, parentId: null, deletedAt: null }, select: { id: true } });
      if (!parent) throw new BadRequestException('You can reply to a message in this conversation, but not to a reply.');
    }
    const message = shape(await this.prisma.channelMessage.create({ data: { channelId, workspaceId, authorId: userId, body, parentId }, select: messageSelect }));
    await this.markRead(userId, channelId);
    await this.notifyMentions(workspaceId, userId, channel, extractMentionIds(body));
    this.events.publish(workspaceId, { type: 'message', channelId, message }, this.audience(channel));
    return message;
  }

  async edit(identity: AuthenticatedIdentity, workspaceId: string, channelId: string, messageId: string, input: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const channel = await this.channel(workspaceId, channelId, userId);
    const body = parseMessageBody(object(input).body);
    const previous = await this.prisma.channelMessage.findFirst({ where: { id: messageId, channelId, workspaceId, authorId: userId, deletedAt: null }, select: { body: true } });
    if (!previous) throw new NotFoundException('You can only edit your own messages.');
    const result = await this.prisma.channelMessage.updateMany({ where: { id: messageId, channelId, workspaceId, authorId: userId, deletedAt: null }, data: { body, editedAt: new Date() } });
    if (result.count !== 1) throw new NotFoundException('You can only edit your own messages.');
    // Only people newly mentioned by the edit are told, so fixing a typo never pings anyone twice.
    const already = new Set(extractMentionIds(previous.body));
    await this.notifyMentions(workspaceId, userId, channel, extractMentionIds(body).filter((id) => !already.has(id)));
    const message = shape(await this.prisma.channelMessage.findUniqueOrThrow({ where: { id: messageId }, select: messageSelect }));
    this.events.publish(workspaceId, { type: 'message_updated', channelId, message }, this.audience(channel));
    return message;
  }

  /** The author can delete their message. Owners and administrators can delete anyone's. */
  async remove(identity: AuthenticatedIdentity, workspaceId: string, channelId: string, messageId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const channel = await this.channel(workspaceId, channelId, userId);
    const message = await this.prisma.channelMessage.findFirst({ where: { id: messageId, channelId, workspaceId, deletedAt: null }, select: { authorId: true, parentId: true } });
    if (!message) throw new NotFoundException('Message not found.');
    if (message.authorId !== userId && !['OWNER', 'ADMINISTRATOR'].includes((await this.role(userId, workspaceId)) ?? '')) throw new ForbiddenException('You can only delete your own messages.');
    await this.prisma.channelMessage.update({ where: { id: messageId }, data: { body: '', deletedAt: new Date() } });
    this.events.publish(workspaceId, { type: 'message_deleted', channelId, id: messageId, parentId: message.parentId }, this.audience(channel));
    return { id: messageId, deleted: true };
  }

  /** Finds messages in the conversations you can see. Other people's private conversations are never searched. */
  async search(identity: AuthenticatedIdentity, workspaceId: string, query: { q?: string }) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const q = parseSearchQuery(query.q);
    const rows = await this.prisma.channelMessage.findMany({
      where: { workspaceId, deletedAt: null, body: { contains: q, mode: 'insensitive' }, channel: visibleTo(userId) },
      orderBy: { createdAt: 'desc' }, take: messageLimits.search,
      select: { id: true, channelId: true, parentId: true, body: true, createdAt: true, author: authorSelect, channel: { select: { kind: true, name: true, members: { select: { user: authorSelect } } } } },
    });
    return rows.map(({ channel, ...row }) => ({ ...row, channel: { kind: channel.kind, name: channel.name, participants: channel.kind === 'CHANNEL' ? [] : channel.members.map((member) => member.user) } }));
  }

  /** Mentioned workspace members (not the author) get an Inbox notification. In a private conversation only its people can be told. */
  private async notifyMentions(workspaceId: string, actorId: string, channel: RawChannel, ids: string[]) {
    const allowed = channel.kind === 'CHANNEL' ? null : new Set(channel.members.map((member) => member.user.id));
    const targets = ids.filter((id) => id !== actorId && (!allowed || allowed.has(id)));
    if (!targets.length) return;
    const members = await this.prisma.workspaceMember.findMany({ where: { workspaceId, userId: { in: targets } }, select: { userId: true } });
    if (!members.length) return;
    const where = channel.kind === 'CHANNEL' ? `#${channel.name}` : 'a conversation';
    await this.prisma.$transaction(async (transaction) => {
      const activity = await transaction.workspaceActivity.create({ data: { workspaceId, actorId, entityType: 'CHANNEL', entityId: channel.id, message: `mentioned you in ${where}`, recipientScoped: true } });
      await transaction.activityReceipt.createMany({ data: members.map((member) => ({ activityId: activity.id, userId: member.userId, isNotificationTarget: true })), skipDuplicates: true });
    });
  }

  private markRead(userId: string, channelId: string) {
    const now = new Date();
    return this.prisma.channelRead.upsert({ where: { channelId_userId: { channelId, userId } }, create: { channelId, userId, lastReadAt: now }, update: { lastReadAt: now } });
  }

  async read(identity: AuthenticatedIdentity, workspaceId: string, channelId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    await this.channel(workspaceId, channelId, userId);
    await this.markRead(userId, channelId);
    return { read: true };
  }

  /** Called once when a live connection opens, so a non-member never gets a stream. */
  async openStream(identity: AuthenticatedIdentity, workspaceId: string) {
    return requireWorkspaceMember(this.prisma, identity, workspaceId);
  }
}
