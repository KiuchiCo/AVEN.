import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(identity: AuthenticatedIdentity, workspaceId: string, input: { q?: string; archived?: string }) {
    await this.requireMember(identity, workspaceId);
    const query = input.q?.trim();
    if (query && (query.length < 2 || query.length > 100)) throw new BadRequestException('Search must be between 2 and 100 characters.');
    const archived = input.archived === 'true';
    return this.prisma.knowledgeItem.findMany({
      where: {
        workspaceId,
        archivedAt: archived ? { not: null } : null,
        ...(query ? { OR: [{ title: { contains: query, mode: 'insensitive' } }, { content: { contains: query, mode: 'insensitive' } }, { tags: { has: query.toLocaleLowerCase() } }] } : {}),
      },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }], take: 200,
      include: { createdBy: { select: { id: true, displayName: true } } },
    });
  }

  async create(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await this.requireMember(identity, workspaceId, true);
    const body = objectBody(input);
    const title = requiredText(body.title, 'Title', 200);
    const content = requiredText(body.content, 'Content', 20_000);
    const sourceUrl = optionalUrl(body.sourceUrl);
    const tags = tagList(body.tags);
    const item = await this.prisma.knowledgeItem.create({ data: { workspaceId, createdById: userId, title, content, sourceUrl, tags }, include: { createdBy: { select: { id: true, displayName: true } } } });
    await this.recordActivity(workspaceId, userId, item.id, `added “${title}” to Knowledge`);
    return item;
  }

  async update(identity: AuthenticatedIdentity, workspaceId: string, itemId: string, input: unknown) {
    const userId = await this.requireMember(identity, workspaceId, true);
    const body = objectBody(input);
    const data: { title?: string; content?: string; sourceUrl?: string | null; tags?: string[]; isPinned?: boolean } = {};
    if ('title' in body) data.title = requiredText(body.title, 'Title', 200);
    if ('content' in body) data.content = requiredText(body.content, 'Content', 20_000);
    if ('sourceUrl' in body) data.sourceUrl = optionalUrl(body.sourceUrl);
    if ('tags' in body) data.tags = tagList(body.tags);
    if ('isPinned' in body) {
      if (typeof body.isPinned !== 'boolean') throw new BadRequestException('isPinned must be a boolean.');
      data.isPinned = body.isPinned;
    }
    if (!Object.keys(data).length) throw new BadRequestException('Provide at least one Knowledge item field to update.');
    const result = await this.prisma.knowledgeItem.updateMany({ where: { id: itemId, workspaceId, archivedAt: null }, data });
    if (!result.count) throw new NotFoundException('Knowledge item not found in this workspace.');
    const item = await this.prisma.knowledgeItem.findFirstOrThrow({ where: { id: itemId, workspaceId }, include: { createdBy: { select: { id: true, displayName: true } } } });
    await this.recordActivity(workspaceId, userId, item.id, `updated Knowledge item “${item.title}”`);
    return item;
  }

  async archive(identity: AuthenticatedIdentity, workspaceId: string, itemId: string, archived: boolean) {
    const userId = await this.requireMember(identity, workspaceId, true);
    const result = await this.prisma.knowledgeItem.updateMany({ where: { id: itemId, workspaceId }, data: { archivedAt: archived ? new Date() : null } });
    if (!result.count) throw new NotFoundException('Knowledge item not found in this workspace.');
    const item = await this.prisma.knowledgeItem.findFirstOrThrow({ where: { id: itemId, workspaceId }, select: { id: true, title: true } });
    await this.recordActivity(workspaceId, userId, item.id, `${archived ? 'archived' : 'restored'} Knowledge item “${item.title}”`);
    return { id: item.id, archived };
  }

  private async requireMember(identity: AuthenticatedIdentity, workspaceId: string, write = false) {
    const user = await this.prisma.user.findUnique({ where: { identityIssuer_identitySubject: { identityIssuer: identity.issuer, identitySubject: identity.subject } }, select: { id: true } });
    if (!user) throw new ForbiddenException('Your AVEN account is not connected to a workspace yet.');
    const member = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } }, select: { userId: true, role: true } });
    if (!member) throw new NotFoundException('Workspace not found.');
    if (write && member.role === 'GUEST') throw new ForbiddenException('Guest members have read-only access to this workspace.');
    return user.id;
  }

  private recordActivity(workspaceId: string, actorId: string, entityId: string, message: string) {
    return this.prisma.workspaceActivity.create({ data: { workspaceId, actorId, entityType: 'KNOWLEDGE', entityId, message } });
  }
}

function objectBody(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('A JSON object is required.');
  return input as Record<string, unknown>;
}

function requiredText(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} must be between 1 and ${max} characters.`);
  return value.trim();
}

function optionalUrl(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048) throw new BadRequestException('Source URL is invalid.');
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    return url.toString();
  } catch { throw new BadRequestException('Source URL must be an http or https address.'); }
}

function tagList(value: unknown) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 20) throw new BadRequestException('Use up to 20 tags.');
  const tags = value.map((tag) => requiredText(tag, 'Tag', 40).toLocaleLowerCase());
  return [...new Set(tags)];
}
