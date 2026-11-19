import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { parseBaseUpdatedAt } from '../productivity/document-concurrency.js';
import { parseElements, parseName, type Element } from './whiteboard-rules.js';

const summary = { id: true, name: true, updatedAt: true, createdAt: true, createdBy: { select: { displayName: true } } } as const;
const detail = { ...summary, content: true } as const;
const body = (input: unknown) => { if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('A JSON object is required.'); return input as Record<string, unknown>; };

@Injectable()
export class WhiteboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(identity: AuthenticatedIdentity, workspaceId: string) {
    await requireWorkspaceMember(this.prisma, identity, workspaceId);
    return this.prisma.whiteboard.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, take: 200, select: summary });
  }

  async get(identity: AuthenticatedIdentity, workspaceId: string, id: string) {
    await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const board = await this.prisma.whiteboard.findFirst({ where: { id, workspaceId }, select: detail });
    if (!board) throw new NotFoundException('Whiteboard not found in this workspace.');
    return board;
  }

  /** Cards may only point at things in this workspace, so a board can't be used to probe other workspaces. */
  private async assertEntities(workspaceId: string, elements: Element[]) {
    const wanted = (type: 'TASK' | 'DOCUMENT' | 'PROJECT') => [...new Set(elements.filter((element) => element.entity?.type === type).map((element) => element.entity!.id))];
    const [tasks, documents, projects] = [wanted('TASK'), wanted('DOCUMENT'), wanted('PROJECT')];
    const [taskCount, documentCount, projectCount] = await Promise.all([
      tasks.length ? this.prisma.task.count({ where: { workspaceId, id: { in: tasks } } }) : 0,
      documents.length ? this.prisma.document.count({ where: { workspaceId, id: { in: documents } } }) : 0,
      projects.length ? this.prisma.project.count({ where: { workspaceId, id: { in: projects } } }) : 0,
    ]);
    if (taskCount !== tasks.length || documentCount !== documents.length || projectCount !== projects.length) throw new BadRequestException('A linked task, document or project was not found in this workspace.');
  }

  async create(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const fields = body(input);
    const name = parseName(fields.name);
    const elements = fields.elements === undefined ? [] : parseElements(fields.elements);
    await this.assertEntities(workspaceId, elements);
    return this.prisma.$transaction(async (transaction) => {
      const board = await transaction.whiteboard.create({ data: { workspaceId, createdById: userId, name, content: { elements } as unknown as Prisma.InputJsonValue }, select: detail });
      await transaction.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'WHITEBOARD', entityId: board.id, message: `created whiteboard “${name}”` } });
      return board;
    });
  }

  /** Renaming needs no base version. Changing the drawing does, so nobody's work is silently overwritten. */
  async update(identity: AuthenticatedIdentity, workspaceId: string, id: string, input: unknown) {
    await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const fields = body(input);
    const data: Prisma.WhiteboardUpdateManyMutationInput = {};
    if (fields.name !== undefined) data.name = parseName(fields.name);
    if (fields.elements !== undefined) { const elements = parseElements(fields.elements); await this.assertEntities(workspaceId, elements); data.content = { elements } as unknown as Prisma.InputJsonValue; }
    if (!Object.keys(data).length) throw new BadRequestException('Provide a name or elements to save.');
    const where: Prisma.WhiteboardWhereInput = { id, workspaceId, ...(fields.elements !== undefined ? { updatedAt: parseBaseUpdatedAt(fields.baseUpdatedAt) } : {}) };
    const result = await this.prisma.whiteboard.updateMany({ where, data });
    const board = await this.prisma.whiteboard.findFirst({ where: { id, workspaceId }, select: detail });
    if (!board) throw new NotFoundException('Whiteboard not found in this workspace.');
    if (result.count !== 1) throw new ConflictException({ message: 'This whiteboard was changed by someone else while you were editing.', current: board });
    return board;
  }

  async remove(identity: AuthenticatedIdentity, workspaceId: string, id: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const board = await this.prisma.whiteboard.findFirst({ where: { id, workspaceId }, select: { name: true } });
    if (!board) throw new NotFoundException('Whiteboard not found in this workspace.');
    await this.prisma.$transaction([
      this.prisma.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'WHITEBOARD', entityId: id, message: `deleted whiteboard “${board.name}”` } }),
      this.prisma.whiteboard.deleteMany({ where: { id, workspaceId } }),
    ]);
    return { id, deleted: true };
  }
}
