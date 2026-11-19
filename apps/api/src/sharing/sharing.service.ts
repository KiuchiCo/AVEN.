import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { FilesService } from '../files/files.service.js';
import { createInvitationToken, hashInvitationToken } from '../productivity/invitation-token.js';
import { imageFileIds, parseExpiry, publicBlocks, shareLimits, shareState } from './share-rules.js';

const GONE = 'This link is no longer available.';

@Injectable()
export class SharingService {
  constructor(private readonly prisma: PrismaService, private readonly files: FilesService) {}

  private async document(workspaceId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, workspaceId }, select: { id: true, title: true } });
    if (!document) throw new NotFoundException('Document not found in this workspace.');
    return document;
  }

  /** The secret is shown once, here. Only its hash is kept, so a link can be revoked but never looked up again. */
  async create(identity: AuthenticatedIdentity, workspaceId: string, documentId: string, input: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const document = await this.document(workspaceId, documentId);
    const expiresAt = parseExpiry(input && typeof input === 'object' ? (input as { expiresInDays?: unknown }).expiresInDays : undefined);
    const active = await this.prisma.documentShare.count({ where: { documentId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    if (active >= shareLimits.activePerDocument) throw new BadRequestException(`A document can have up to ${shareLimits.activePerDocument} active share links. Revoke one first.`);
    const token = createInvitationToken();
    const share = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.documentShare.create({ data: { workspaceId, documentId, createdById: userId, tokenHash: hashInvitationToken(token), expiresAt }, select: { id: true, createdAt: true, expiresAt: true } });
      await transaction.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'DOCUMENT', entityId: documentId, message: `created a public share link for “${document.title}”` } });
      return created;
    });
    return { ...share, token, url: `${readApiEnvironment().webBaseUrl.replace(/\/$/, '')}/shared/${token}` };
  }

  async list(identity: AuthenticatedIdentity, workspaceId: string, documentId: string) {
    await requireWorkspaceMember(this.prisma, identity, workspaceId);
    await this.document(workspaceId, documentId);
    const rows = await this.prisma.documentShare.findMany({ where: { documentId, workspaceId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, createdAt: true, expiresAt: true, revokedAt: true, viewCount: true, lastViewedAt: true, createdBy: { select: { displayName: true } } } });
    return rows.map((row) => ({ ...row, state: shareState(row) }));
  }

  async revoke(identity: AuthenticatedIdentity, workspaceId: string, documentId: string, shareId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const document = await this.document(workspaceId, documentId);
    const result = await this.prisma.documentShare.updateMany({ where: { id: shareId, documentId, workspaceId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (result.count !== 1) throw new NotFoundException('Share link not found.');
    await this.prisma.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'DOCUMENT', entityId: documentId, message: `turned off a public share link for “${document.title}”` } });
    return { revoked: true };
  }

  // ---- public side: no sign-in. Every failure looks the same, so a link can't be probed for hints. ----

  private async resolve(token: string) {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new NotFoundException(GONE);
    const share = await this.prisma.documentShare.findUnique({ where: { tokenHash: hashInvitationToken(token) }, select: { id: true, workspaceId: true, revokedAt: true, expiresAt: true, document: { select: { id: true, title: true, content: true, updatedAt: true } } } });
    if (!share || shareState(share) !== 'ACTIVE') throw new NotFoundException(GONE);
    return share;
  }

  async view(token: string) {
    const share = await this.resolve(token);
    await this.prisma.documentShare.update({ where: { id: share.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } }).catch(() => undefined);
    return { title: share.document.title, updatedAt: share.document.updatedAt, blocks: publicBlocks(share.document.content, (fileId) => `/api/v1/shared/documents/${token}/images/${fileId}`) };
  }

  /** An image is served only if this document's own image blocks use it. */
  async image(token: string, fileId: string) {
    const share = await this.resolve(token);
    if (!imageFileIds(share.document.content).includes(fileId.toLowerCase())) throw new NotFoundException(GONE);
    return this.files.publicImage(share.workspaceId, fileId.toLowerCase());
  }
}
