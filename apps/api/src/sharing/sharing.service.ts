import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionsService } from '../billing/permissions.service.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { ExportService, type ExportFormat } from '../export/export.service.js';
import { FilesService } from '../files/files.service.js';
import { createInvitationToken, hashInvitationToken } from '../productivity/invitation-token.js';
import { embeddedDatabaseIds, imageFileIds, parseExpiry, parseShareOptions, publicBlocks, shareLimits, shareState } from './share-rules.js';

const GONE = 'This link is no longer available.';
const listFields = { id: true, createdAt: true, expiresAt: true, revokedAt: true, viewCount: true, lastViewedAt: true, accessLevel: true, allowDownload: true, allowPrint: true, includeEmbeds: true, createdBy: { select: { displayName: true } } } as const;

/**
 * Public share links. A link is a random secret; only its SHA-256 hash is stored. Creating, changing, revoking and replacing links needs a signed-in
 * member who may share; opening one needs nothing but the secret, and grants read-only access to that one document.
 * Sharing is not a paid feature: every plan can do all of this (a Business workspace may restrict who may create links, as it can for other actions).
 */
@Injectable()
export class SharingService {
  /** Failed guesses per address, so a link cannot be searched for by trying secrets. shortcut: per API process; move to Redis with more than one instance. */
  private readonly misses = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly prisma: PrismaService, private readonly files: FilesService, private readonly permissions: PermissionsService, private readonly exports: ExportService) {}

  private async document(workspaceId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, workspaceId }, select: { id: true, title: true } });
    if (!document) throw new NotFoundException('Document not found in this workspace.');
    return document;
  }

  private url(token: string) { return `${readApiEnvironment().webBaseUrl.replace(/\/$/, '')}/shared/${token}`; }

  /** The secret is shown once, here. Only its hash is kept, so a link can be revoked but never looked up again. */
  async create(identity: AuthenticatedIdentity, workspaceId: string, documentId: string, input: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    await this.permissions.assert(workspaceId, userId, 'sharing');
    const document = await this.document(workspaceId, documentId);
    const body = input && typeof input === 'object' ? (input as { expiresInDays?: unknown }) : {};
    const expiresAt = parseExpiry(body.expiresInDays);
    const options = parseShareOptions(input);
    const active = await this.prisma.documentShare.count({ where: { documentId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    if (active >= shareLimits.activePerDocument) throw new BadRequestException(`A document can have up to ${shareLimits.activePerDocument} active share links. Revoke one first.`);
    const token = createInvitationToken();
    const share = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.documentShare.create({ data: { workspaceId, documentId, createdById: userId, tokenHash: hashInvitationToken(token), expiresAt, ...options }, select: listFields });
      await transaction.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'DOCUMENT', entityId: documentId, message: `created a public share link for “${document.title}”`.slice(0, 240) } });
      return created;
    });
    return { ...share, token, url: this.url(token) };
  }

  async list(identity: AuthenticatedIdentity, workspaceId: string, documentId: string) {
    await requireWorkspaceMember(this.prisma, identity, workspaceId);
    await this.document(workspaceId, documentId);
    const rows = await this.prisma.documentShare.findMany({ where: { documentId, workspaceId }, orderBy: { createdAt: 'desc' }, take: 50, select: listFields });
    return rows.map((row) => ({ ...row, state: shareState(row) }));
  }

  /** Changes what an active link allows. The link itself (its secret) stays the same. */
  async update(identity: AuthenticatedIdentity, workspaceId: string, documentId: string, shareId: string, input: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    await this.permissions.assert(workspaceId, userId, 'sharing');
    const document = await this.document(workspaceId, documentId);
    const share = await this.prisma.documentShare.findFirst({ where: { id: shareId, documentId, workspaceId }, select: { id: true, revokedAt: true, expiresAt: true, allowDownload: true, allowPrint: true, includeEmbeds: true } });
    if (!share || shareState(share) !== 'ACTIVE') throw new NotFoundException('Share link not found.');
    const body = input && typeof input === 'object' && !Array.isArray(input) ? (input as { expiresInDays?: unknown }) : {};
    const options = parseShareOptions(input, share);
    const data: { allowDownload: boolean; allowPrint: boolean; includeEmbeds: boolean; expiresAt?: Date | null } = { ...options };
    if ('expiresInDays' in body) data.expiresAt = parseExpiry(body.expiresInDays);
    const updated = await this.prisma.documentShare.update({ where: { id: share.id }, data, select: listFields });
    await this.prisma.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'DOCUMENT', entityId: documentId, message: `changed a public share link for “${document.title}”`.slice(0, 240) } });
    return { ...updated, state: shareState(updated) };
  }

  async revoke(identity: AuthenticatedIdentity, workspaceId: string, documentId: string, shareId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const document = await this.document(workspaceId, documentId);
    const result = await this.prisma.documentShare.updateMany({ where: { id: shareId, documentId, workspaceId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (result.count !== 1) throw new NotFoundException('Share link not found.');
    await this.prisma.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'DOCUMENT', entityId: documentId, message: `turned off a public share link for “${document.title}”`.slice(0, 240) } });
    return { revoked: true };
  }

  /** Turns a link off and makes a new one with the same settings, in one step: the old address stops working at the moment the new one exists. */
  async regenerate(identity: AuthenticatedIdentity, workspaceId: string, documentId: string, shareId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    await this.permissions.assert(workspaceId, userId, 'sharing');
    const document = await this.document(workspaceId, documentId);
    const old = await this.prisma.documentShare.findFirst({ where: { id: shareId, documentId, workspaceId }, select: { id: true, revokedAt: true, expiresAt: true, allowDownload: true, allowPrint: true, includeEmbeds: true } });
    if (!old) throw new NotFoundException('Share link not found.');
    const token = createInvitationToken();
    const share = await this.prisma.$transaction(async (transaction) => {
      if (!old.revokedAt) await transaction.documentShare.update({ where: { id: old.id }, data: { revokedAt: new Date() } });
      const created = await transaction.documentShare.create({ data: { workspaceId, documentId, createdById: userId, tokenHash: hashInvitationToken(token), expiresAt: old.expiresAt && old.expiresAt.getTime() > Date.now() ? old.expiresAt : null, allowDownload: old.allowDownload, allowPrint: old.allowPrint, includeEmbeds: old.includeEmbeds }, select: listFields });
      await transaction.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'DOCUMENT', entityId: documentId, message: `replaced the public share link for “${document.title}”`.slice(0, 240) } });
      return created;
    });
    return { ...share, state: shareState(share), token, url: this.url(token) };
  }

  // ---- public side: no sign-in. Every failure looks the same, so a link can't be probed for hints. ----

  private tooMany(ip: string | undefined) {
    const entry = this.misses.get(ip ?? 'unknown');
    if (entry && entry.resetAt > Date.now() && entry.count >= 30) throw new HttpException('Too many attempts. Please wait a few minutes.', 429);
  }
  private miss(ip: string | undefined): never {
    const key = ip ?? 'unknown'; const now = Date.now();
    const entry = this.misses.get(key);
    if (!entry || entry.resetAt <= now) this.misses.set(key, { count: 1, resetAt: now + 10 * 60_000 }); else entry.count += 1;
    if (this.misses.size > 10_000) for (const [k, v] of this.misses) if (v.resetAt <= now) this.misses.delete(k);
    throw new NotFoundException(GONE);
  }

  private async resolve(token: string, ip: string | undefined) {
    this.tooMany(ip);
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return this.miss(ip);
    const share = await this.prisma.documentShare.findUnique({ where: { tokenHash: hashInvitationToken(token) }, select: { id: true, workspaceId: true, createdById: true, revokedAt: true, expiresAt: true, allowDownload: true, allowPrint: true, includeEmbeds: true, document: { select: { id: true, title: true, content: true, updatedAt: true } } } });
    if (!share || shareState(share) !== 'ACTIVE') return this.miss(ip);
    // The link belongs to the person who made it: if they have left the workspace, or can no longer edit it, it stops working.
    const owner = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: share.workspaceId, userId: share.createdById } }, select: { role: true } });
    if (!owner || owner.role === 'GUEST') return this.miss(ip);
    return share;
  }

  async view(token: string, ip?: string) {
    const share = await this.resolve(token, ip);
    await this.prisma.documentShare.update({ where: { id: share.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } }).catch(() => undefined);
    let embeds: Map<string, string[][]> | null = null;
    if (share.includeEmbeds) {
      embeds = new Map();
      for (const id of embeddedDatabaseIds(share.document.content).slice(0, 10)) {
        const database = await this.prisma.workspaceDatabase.findFirst({ where: { id, workspaceId: share.workspaceId }, select: { name: true, properties: true } });
        if (!database) continue;
        const properties = (Array.isArray(database.properties) ? database.properties : []).filter((p): p is { id: string; name: string } => Boolean(p) && typeof p === 'object' && typeof (p as { id?: unknown }).id === 'string');
        const records = await this.prisma.databaseRecord.findMany({ where: { databaseId: id, workspaceId: share.workspaceId }, orderBy: { createdAt: 'asc' }, take: 100, select: { values: true } });
        const cell = (value: unknown) => (value === null || value === undefined || typeof value === 'object' ? '' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value).slice(0, 300));
        embeds.set(id, [properties.map((p) => String(p.name ?? p.id).slice(0, 80)), ...records.map((record) => properties.map((p) => cell((record.values as Record<string, unknown>)?.[p.id])))]);
      }
    }
    return { title: share.document.title, updatedAt: share.document.updatedAt, allowDownload: share.allowDownload, allowPrint: share.allowPrint, blocks: publicBlocks(share.document.content, (fileId) => `/api/v1/shared/documents/${token}/images/${fileId}`, embeds) };
  }

  /** An image is served only if this document's own image blocks use it. */
  async image(token: string, fileId: string, ip?: string) {
    const share = await this.resolve(token, ip);
    if (!imageFileIds(share.document.content).includes(fileId.toLowerCase())) return this.miss(ip);
    return this.files.publicImage(share.workspaceId, fileId.toLowerCase());
  }

  /** PDF or Word for a reader of the link, only if the owner allowed downloads for it. */
  async download(token: string, format: ExportFormat, ip?: string) {
    const share = await this.resolve(token, ip);
    if (!share.allowDownload) throw new HttpException('Downloads are turned off for this link.', 403);
    return this.exports.render({ id: share.document.id, title: share.document.title, content: share.document.content, updatedAt: share.document.updatedAt }, share.workspaceId, format, { kind: 'public', includeEmbeds: share.includeEmbeds });
  }
  headers(file: Parameters<ExportService['headers']>[0]) { return this.exports.headers(file); }
}
