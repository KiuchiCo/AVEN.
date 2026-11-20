import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { PrismaService } from '../database/prisma.service.js';
import type { FavouriteKind } from '../generated/prisma/client.js';

export const MAX_FAVOURITES = 30;
const kinds = ['PROJECT', 'DOCUMENT', 'DATABASE', 'WHITEBOARD'] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const hrefFor = (kind: FavouriteKind, id: string) => ({ PROJECT: `/workspace/projects/${id}`, DOCUMENT: `/workspace/documents/${id}`, DATABASE: '/workspace/databases', WHITEBOARD: `/workspace/whiteboards/${id}` })[kind];

export function parseFavourite(input: unknown): { kind: FavouriteKind; entityId: string } {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input as { kind?: unknown; entityId?: unknown } : {};
  if (!kinds.includes(body.kind as never) || typeof body.entityId !== 'string' || !uuid.test(body.entityId)) throw new BadRequestException('Choose a project, document, database or whiteboard.');
  return { kind: body.kind as FavouriteKind, entityId: body.entityId.toLowerCase() };
}

@Injectable()
export class FavouritesService {
  constructor(private readonly prisma: PrismaService) {}

  private async title(workspaceId: string, kind: FavouriteKind, id: string): Promise<string | null> {
    switch (kind) {
      case 'PROJECT': return (await this.prisma.project.findFirst({ where: { id, workspaceId }, select: { name: true } }))?.name ?? null;
      case 'DOCUMENT': return (await this.prisma.document.findFirst({ where: { id, workspaceId }, select: { title: true } }))?.title ?? null;
      case 'DATABASE': return (await this.prisma.workspaceDatabase.findFirst({ where: { id, workspaceId }, select: { name: true } }))?.name ?? null;
      case 'WHITEBOARD': return (await this.prisma.whiteboard.findFirst({ where: { id, workspaceId }, select: { name: true } }))?.name ?? null;
    }
  }

  /** Newest pin last. Items that have since been deleted are quietly left out (and forgotten). */
  async list(identity: AuthenticatedIdentity, workspaceId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const rows = await this.prisma.favourite.findMany({ where: { userId, workspaceId }, orderBy: { createdAt: 'asc' }, take: MAX_FAVOURITES });
    const [projects, documents, databases, boards] = await Promise.all([
      this.prisma.project.findMany({ where: { workspaceId, id: { in: rows.filter((r) => r.kind === 'PROJECT').map((r) => r.entityId) } }, select: { id: true, name: true } }),
      this.prisma.document.findMany({ where: { workspaceId, id: { in: rows.filter((r) => r.kind === 'DOCUMENT').map((r) => r.entityId) } }, select: { id: true, title: true } }),
      this.prisma.workspaceDatabase.findMany({ where: { workspaceId, id: { in: rows.filter((r) => r.kind === 'DATABASE').map((r) => r.entityId) } }, select: { id: true, name: true } }),
      this.prisma.whiteboard.findMany({ where: { workspaceId, id: { in: rows.filter((r) => r.kind === 'WHITEBOARD').map((r) => r.entityId) } }, select: { id: true, name: true } }),
    ]);
    const names = new Map<string, string>([...projects.map((x) => [x.id, x.name] as const), ...documents.map((x) => [x.id, x.title] as const), ...databases.map((x) => [x.id, x.name] as const), ...boards.map((x) => [x.id, x.name] as const)]);
    const gone = rows.filter((row) => !names.has(row.entityId));
    if (gone.length) await this.prisma.favourite.deleteMany({ where: { id: { in: gone.map((row) => row.id) } } });
    return rows.filter((row) => names.has(row.entityId)).map((row) => ({ id: row.id, kind: row.kind, entityId: row.entityId, title: names.get(row.entityId)!, href: hrefFor(row.kind, row.entityId) }));
  }

  /** Pinning something twice changes nothing. You can only pin what is in this workspace. */
  async add(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const { kind, entityId } = parseFavourite(input);
    if (await this.title(workspaceId, kind, entityId) === null) throw new BadRequestException('That item was not found in this workspace.');
    const existing = await this.prisma.favourite.findUnique({ where: { userId_kind_entityId: { userId, kind, entityId } } });
    if (existing) return { id: existing.id, kind, entityId };
    if (await this.prisma.favourite.count({ where: { userId, workspaceId } }) >= MAX_FAVOURITES) throw new BadRequestException(`You can pin up to ${MAX_FAVOURITES} favourites. Remove one first.`);
    const created = await this.prisma.favourite.create({ data: { userId, workspaceId, kind, entityId }, select: { id: true } });
    return { id: created.id, kind, entityId };
  }

  async remove(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const { kind, entityId } = parseFavourite(input);
    await this.prisma.favourite.deleteMany({ where: { userId, workspaceId, kind, entityId } });
    return { removed: true };
  }
}
