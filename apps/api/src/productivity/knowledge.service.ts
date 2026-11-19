import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(identity: AuthenticatedIdentity, workspaceId: string, input: { q?: string; archived?: string; projectId?: string; tag?: string; page?: string }) {
    await this.requireMember(identity, workspaceId);
    const query = input.q?.trim();
    if (query && (query.length < 2 || query.length > 100)) throw new BadRequestException('Search must be between 2 and 100 characters.');
    const page = input.page === undefined ? 1 : Number(input.page);
    if (!Number.isInteger(page) || page < 1 || page > 10_000) throw new BadRequestException('Page must be a positive integer.');
    const projectId = input.projectId ? optionalUuid(input.projectId, 'Project') : null;
    if (projectId && !await this.prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })) throw new NotFoundException('Project not found in this workspace.');
    const tag = input.tag?.trim().toLocaleLowerCase();
    if (tag && tag.length > 40) throw new BadRequestException('Tag filters must be 40 characters or fewer.');
    const archived = input.archived === 'true';
    const where = {
      workspaceId,
      archivedAt: archived ? { not: null } : null,
      ...(projectId ? { projectId } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
      ...(query ? { OR: [{ title: { contains: query, mode: 'insensitive' as const } }, { content: { contains: query, mode: 'insensitive' as const } }, { tags: { has: query.toLocaleLowerCase() } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.knowledgeItem.findMany({ where, orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 50, take: 51, include: knowledgeInclude }),
      this.prisma.knowledgeItem.count({ where }),
    ]);
    const hasMore = items.length > 50;
    return { items: hasMore ? items.slice(0, 50) : items, total, page, hasMore };
  }

  async create(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await this.requireMember(identity, workspaceId, true);
    const body = objectBody(input);
    const links = await this.validateLinks(workspaceId, body);
    const title = requiredText(body.title, 'Title', 200);
    const content = requiredText(body.content, 'Content', 20_000);
    const sourceUrl = optionalUrl(body.sourceUrl);
    const tags = tagList(body.tags);
    const item = await this.prisma.knowledgeItem.create({ data: { workspaceId, createdById: userId, title, content, sourceUrl, tags, ...links }, include: knowledgeInclude });
    await this.recordActivity(workspaceId, userId, item.id, `added “${title}” to Knowledge`);
    return item;
  }

  async update(identity: AuthenticatedIdentity, workspaceId: string, itemId: string, input: unknown) {
    const userId = await this.requireMember(identity, workspaceId, true);
    const body = objectBody(input);
    const existing = await this.prisma.knowledgeItem.findFirst({ where: { id: itemId, workspaceId, archivedAt: null } });
    if (!existing) throw new NotFoundException('Knowledge item not found in this workspace.');

    const data: { title?: string; content?: string; sourceUrl?: string | null; tags?: string[]; isPinned?: boolean; projectId?: string | null; documentId?: string | null; taskId?: string | null } = {};
    if ('title' in body) data.title = requiredText(body.title, 'Title', 200);
    if ('content' in body) data.content = requiredText(body.content, 'Content', 20_000);
    if ('sourceUrl' in body) data.sourceUrl = optionalUrl(body.sourceUrl);
    if ('tags' in body) data.tags = tagList(body.tags);
    if ('isPinned' in body) {
      if (typeof body.isPinned !== 'boolean') throw new BadRequestException('isPinned must be a boolean.');
      data.isPinned = body.isPinned;
    }
    const links = await this.validateLinks(workspaceId, body, existing);
    Object.assign(data, links);
    if (!Object.keys(data).length) throw new BadRequestException('Provide at least one Knowledge item field to update.');

    const contentChanged = (data.title !== undefined && data.title !== existing.title)
      || (data.content !== undefined && data.content !== existing.content)
      || (data.sourceUrl !== undefined && data.sourceUrl !== existing.sourceUrl)
      || (data.tags !== undefined && JSON.stringify(data.tags) !== JSON.stringify(existing.tags))
      || (data.projectId !== undefined && data.projectId !== existing.projectId)
      || (data.documentId !== undefined && data.documentId !== existing.documentId)
      || (data.taskId !== undefined && data.taskId !== existing.taskId);

    return this.prisma.$transaction(async (transaction) => {
      if (contentChanged) await transaction.knowledgeVersion.create({ data: versionSnapshot(existing, userId) });
      const item = await transaction.knowledgeItem.update({ where: { id: itemId }, data, include: knowledgeInclude });
      await transaction.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'KNOWLEDGE', entityId: item.id, message: `updated Knowledge item “${item.title}”` } });
      return item;
    });
  }

  async versions(identity: AuthenticatedIdentity, workspaceId: string, itemId: string) {
    await this.requireMember(identity, workspaceId);
    if (!await this.prisma.knowledgeItem.findFirst({ where: { id: itemId, workspaceId }, select: { id: true } })) throw new NotFoundException('Knowledge item not found in this workspace.');
    return this.prisma.knowledgeVersion.findMany({
      where: { workspaceId, knowledgeItemId: itemId }, orderBy: { createdAt: 'desc' }, take: 50,
      include: { createdBy: { select: { displayName: true } }, project: { select: { id: true, name: true } }, document: { select: { id: true, title: true } }, task: { select: { id: true, title: true } } },
    });
  }

  async restoreVersion(identity: AuthenticatedIdentity, workspaceId: string, itemId: string, versionId: string) {
    const userId = await this.requireMember(identity, workspaceId, true);
    const [item, version] = await Promise.all([
      this.prisma.knowledgeItem.findFirst({ where: { id: itemId, workspaceId } }),
      this.prisma.knowledgeVersion.findFirst({ where: { id: versionId, knowledgeItemId: itemId, workspaceId } }),
    ]);
    if (!item || !version) throw new NotFoundException('Knowledge item or version not found in this workspace.');
    return this.prisma.$transaction(async (transaction) => {
      await transaction.knowledgeVersion.create({ data: versionSnapshot(item, userId) });
      const restored = await transaction.knowledgeItem.update({
        where: { id: itemId },
        data: { title: version.title, content: version.content, sourceUrl: version.sourceUrl, tags: version.tags, projectId: version.projectId, documentId: version.documentId, taskId: version.taskId },
        include: knowledgeInclude,
      });
      await transaction.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'KNOWLEDGE', entityId: itemId, message: `restored “${item.title}” from an earlier Knowledge version` } });
      return restored;
    });
  }

  async archive(identity: AuthenticatedIdentity, workspaceId: string, itemId: string, archived: boolean) {
    const userId = await this.requireMember(identity, workspaceId, true);
    const result = await this.prisma.knowledgeItem.updateMany({ where: { id: itemId, workspaceId }, data: { archivedAt: archived ? new Date() : null } });
    if (!result.count) throw new NotFoundException('Knowledge item not found in this workspace.');
    const item = await this.prisma.knowledgeItem.findFirstOrThrow({ where: { id: itemId, workspaceId }, select: { id: true, title: true } });
    await this.recordActivity(workspaceId, userId, item.id, `${archived ? 'archived' : 'restored'} Knowledge item “${item.title}”`);
    return { id: item.id, archived };
  }

  private async validateLinks(workspaceId: string, body: Record<string, unknown>, existing?: { projectId: string | null; documentId: string | null; taskId: string | null }) {
    const links = {
      projectId: 'projectId' in body ? optionalUuid(body.projectId, 'Project') : existing?.projectId,
      documentId: 'documentId' in body ? optionalUuid(body.documentId, 'Document') : existing?.documentId,
      taskId: 'taskId' in body ? optionalUuid(body.taskId, 'Task') : existing?.taskId,
    };
    const [project, document, task] = await Promise.all([
      links.projectId ? this.prisma.project.findFirst({ where: { id: links.projectId, workspaceId }, select: { id: true } }) : null,
      links.documentId ? this.prisma.document.findFirst({ where: { id: links.documentId, workspaceId }, select: { id: true } }) : null,
      links.taskId ? this.prisma.task.findFirst({ where: { id: links.taskId, workspaceId }, select: { id: true } }) : null,
    ]);
    if (links.projectId && !project) throw new NotFoundException('Project not found in this workspace.');
    if (links.documentId && !document) throw new NotFoundException('Document not found in this workspace.');
    if (links.taskId && !task) throw new NotFoundException('Task not found in this workspace.');
    return Object.fromEntries(Object.entries(links).filter(([key]) => key in body)) as { projectId?: string | null; documentId?: string | null; taskId?: string | null };
  }

  private requireMember(identity: AuthenticatedIdentity, workspaceId: string, write = false) {
    return requireWorkspaceMember(this.prisma, identity, workspaceId, write);
  }

  private recordActivity(workspaceId: string, actorId: string, entityId: string, message: string) {
    return this.prisma.workspaceActivity.create({ data: { workspaceId, actorId, entityType: 'KNOWLEDGE', entityId, message } });
  }
}

const knowledgeInclude = {
  createdBy: { select: { id: true, displayName: true } },
  project: { select: { id: true, name: true } },
  document: { select: { id: true, title: true } },
  task: { select: { id: true, title: true } },
  _count: { select: { versions: true } },
};

function versionSnapshot(item: { workspaceId: string; id: string; title: string; content: string; sourceUrl: string | null; tags: string[]; projectId: string | null; documentId: string | null; taskId: string | null }, createdById: string) {
  return { workspaceId: item.workspaceId, knowledgeItemId: item.id, createdById, title: item.title, content: item.content, sourceUrl: item.sourceUrl, tags: item.tags, projectId: item.projectId, documentId: item.documentId, taskId: item.taskId };
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

function optionalUuid(value: unknown, label: string) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new BadRequestException(`${label} must be a valid ID.`);
  return value;
}
