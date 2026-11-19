import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { auditCsv, auditLimits, cursorFor, parseAuditQuery, type AuditQuery } from './audit-rules.js';

const select = { id: true, createdAt: true, entityType: true, entityId: true, message: true, actor: { select: { id: true, displayName: true, email: true } } } as const;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementsService) {}

  /** Only owners and administrators may read the audit log, and only on plans that include it. */
  private async authorise(identity: AuthenticatedIdentity, workspaceId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const membership = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } });
    if (!membership || !['OWNER', 'ADMINISTRATOR'].includes(membership.role)) throw new ForbiddenException('Only workspace owners and administrators can view the audit log.');
    await this.entitlements.assertFeature(workspaceId, 'auditLog', 'The audit log');
  }

  private where(workspaceId: string, query: AuditQuery): Prisma.WorkspaceActivityWhereInput {
    const and: Prisma.WorkspaceActivityWhereInput[] = [];
    if (query.cursor) and.push({ OR: [{ createdAt: { lt: query.cursor.createdAt } }, { createdAt: query.cursor.createdAt, id: { lt: query.cursor.id } }] });
    return { workspaceId, ...(query.entityType ? { entityType: query.entityType } : {}), ...(query.actorId ? { actorId: query.actorId } : {}), ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}), ...(query.q ? { message: { contains: query.q, mode: 'insensitive' as const } } : {}), ...(and.length ? { AND: and } : {}) };
  }

  async list(identity: AuthenticatedIdentity, workspaceId: string, raw: Record<string, unknown>) {
    await this.authorise(identity, workspaceId);
    const query = parseAuditQuery(raw);
    const rows = await this.prisma.workspaceActivity.findMany({ where: this.where(workspaceId, query), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: auditLimits.page + 1, select });
    const page = rows.slice(0, auditLimits.page);
    return { entries: page, nextCursor: rows.length > auditLimits.page ? cursorFor(page[page.length - 1]) : null };
  }

  async export(identity: AuthenticatedIdentity, workspaceId: string, raw: Record<string, unknown>) {
    await this.authorise(identity, workspaceId);
    const query = parseAuditQuery({ ...raw, cursor: undefined });
    const rows = await this.prisma.workspaceActivity.findMany({ where: this.where(workspaceId, query), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: auditLimits.export, select });
    return { csv: auditCsv(rows), count: rows.length, truncated: rows.length >= auditLimits.export };
  }

  /** People who appear in the log, for the person filter. */
  async actors(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.authorise(identity, workspaceId);
    return (await this.prisma.workspaceMember.findMany({ where: { workspaceId }, select: { user: { select: { id: true, displayName: true } } }, orderBy: { createdAt: 'asc' } })).map((member) => member.user);
  }
}
