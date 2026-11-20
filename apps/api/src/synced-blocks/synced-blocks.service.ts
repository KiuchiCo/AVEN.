import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { PrismaService } from '../database/prisma.service.js';

export const MAX_SYNCED_TEXT = 20_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The text of a synced block, checked: a string within the limit. */
export function parseSyncedText(input: unknown): string {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input as { text?: unknown } : {};
  if (typeof body.text !== 'string') throw new BadRequestException('Send the text for this block.');
  if (body.text.length > MAX_SYNCED_TEXT) throw new BadRequestException(`A synced block can hold up to ${MAX_SYNCED_TEXT} characters.`);
  return body.text;
}

@Injectable()
export class SyncedBlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async read(identity: AuthenticatedIdentity, workspaceId: string, id: string) {
    await requireWorkspaceMember(this.prisma, identity, workspaceId);
    if (!uuid.test(id)) throw new BadRequestException('That is not a synced block.');
    const row = await this.prisma.syncedBlock.findFirst({ where: { id: id.toLowerCase(), workspaceId }, select: { id: true, text: true, updatedAt: true } });
    if (!row) throw new NotFoundException('This synced block has no shared text yet.');
    return row;
  }

  /** Creates the shared text or replaces it. The last write wins; every document showing the block picks it up. */
  async write(identity: AuthenticatedIdentity, workspaceId: string, id: string, input: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    if (!uuid.test(id)) throw new BadRequestException('That is not a synced block.');
    const text = parseSyncedText(input); const key = id.toLowerCase();
    const existing = await this.prisma.syncedBlock.findUnique({ where: { id: key }, select: { workspaceId: true } });
    if (existing && existing.workspaceId !== workspaceId) throw new NotFoundException('This synced block has no shared text yet.'); // an id from another workspace is never touched
    return this.prisma.syncedBlock.upsert({ where: { id: key }, create: { id: key, workspaceId, text, updatedById: userId }, update: { text, updatedById: userId }, select: { id: true, text: true, updatedAt: true } });
  }
}
