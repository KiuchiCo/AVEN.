import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../../auth/auth.types.js';
import { PrismaService } from '../../database/prisma.service.js';
import { TaskCollaborationAccess } from './task-collaboration.access.js';
import { checklistPosition, cleanText, objectBody } from './task-collaboration.input.js';
import { TaskCollaborationNotifications } from './task-collaboration.notifications.js';
import { TaskChecklistOrderService } from './task-checklist-order.service.js';

@Injectable()
export class TaskChecklistService {
  constructor(private readonly prisma: PrismaService, private readonly access: TaskCollaborationAccess, private readonly notifications: TaskCollaborationNotifications, private readonly ordering: TaskChecklistOrderService) {}

  async list(identity: AuthenticatedIdentity, workspaceId: string, taskId: string) {
    await this.access.require(identity, workspaceId, taskId);
    return this.prisma.taskChecklistItem.findMany({ where: { workspaceId, taskId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], include: { createdBy: { select: { id: true, displayName: true } }, completedBy: { select: { id: true, displayName: true } } } });
  }

  async create(identity: AuthenticatedIdentity, workspaceId: string, taskId: string, input: unknown) {
    const { userId, task } = await this.access.require(identity, workspaceId, taskId, true);
    const body = objectBody(input);
    const count = await this.prisma.taskChecklistItem.count({ where: { workspaceId, taskId } });
    if (count >= 100) throw new BadRequestException('A task can have up to 100 checklist items.');
    const item = await this.prisma.taskChecklistItem.create({ data: { workspaceId, taskId, createdById: userId, title: cleanText(body.title, 'Checklist item', 240), position: checklistPosition(body.position, count) }, include: { createdBy: { select: { id: true, displayName: true } }, completedBy: { select: { id: true, displayName: true } } } });
    await this.notifications.notify({ workspaceId, taskId, actorId: userId, entityType: 'TASK_CHECKLIST', message: `added a checklist item to task “${task.title}”` });
    return item;
  }

  async update(identity: AuthenticatedIdentity, workspaceId: string, taskId: string, itemId: string, input: unknown) {
    const { userId, task } = await this.access.require(identity, workspaceId, taskId, true);
    const body = objectBody(input);
    const item = await this.prisma.taskChecklistItem.findFirst({ where: { id: itemId, workspaceId, taskId }, select: { id: true, title: true, completedAt: true } });
    if (!item) throw new NotFoundException('Checklist item not found.');
    const data: { title?: string; position?: number; completedAt?: Date | null; completedById?: string | null } = {};
    if ('title' in body) data.title = cleanText(body.title, 'Checklist item', 240);
    if ('position' in body) data.position = checklistPosition(body.position, 0);
    if ('completed' in body) {
      if (typeof body.completed !== 'boolean') throw new BadRequestException('Checklist completion must be true or false.');
      data.completedAt = body.completed ? new Date() : null;
      data.completedById = body.completed ? userId : null;
    }
    if (!Object.keys(data).length) throw new BadRequestException('Provide a checklist field to update.');
    const titleChanged = typeof data.title === 'string' && data.title !== item.title;
    const completionChanged = 'completed' in body && Boolean(item.completedAt) !== body.completed;
    const updated = await this.prisma.taskChecklistItem.update({ where: { id: itemId }, data, include: { createdBy: { select: { id: true, displayName: true } }, completedBy: { select: { id: true, displayName: true } } } });
    if (titleChanged) await this.notifications.notify({ workspaceId, taskId, actorId: userId, entityType: 'TASK_CHECKLIST', message: `renamed a checklist item on task “${task.title}”` });
    if (completionChanged) await this.notifications.notify({ workspaceId, taskId, actorId: userId, entityType: 'TASK_CHECKLIST', message: `${body.completed ? 'completed' : 'reopened'} a checklist item on task “${task.title}”` });
    return updated;
  }

  async remove(identity: AuthenticatedIdentity, workspaceId: string, taskId: string, itemId: string) {
    const { userId, task } = await this.access.require(identity, workspaceId, taskId, true);
    const item = await this.prisma.taskChecklistItem.findFirst({ where: { id: itemId, workspaceId, taskId }, select: { id: true } });
    if (!item) throw new NotFoundException('Checklist item not found.');
    await this.prisma.taskChecklistItem.delete({ where: { id: itemId } });
    await this.notifications.notify({ workspaceId, taskId, actorId: userId, entityType: 'TASK_CHECKLIST', message: `removed a checklist item from task “${task.title}”` });
    return { id: itemId, deleted: true };
  }

  async move(identity: AuthenticatedIdentity, workspaceId: string, taskId: string, itemId: string, direction: 'UP' | 'DOWN') {
    const { userId, task } = await this.access.require(identity, workspaceId, taskId, true);
    const result = await this.ordering.move(workspaceId, taskId, itemId, direction);
    await this.notifications.notify({ workspaceId, taskId, actorId: userId, entityType: 'TASK_CHECKLIST', message: `reordered the checklist on task “${task.title}”` });
    return result;
  }
}
