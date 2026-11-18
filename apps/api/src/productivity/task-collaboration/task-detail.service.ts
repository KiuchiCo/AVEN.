import { Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../../auth/auth.types.js';
import { PrismaService } from '../../database/prisma.service.js';
import { TaskCollaborationAccess } from './task-collaboration.access.js';

@Injectable()
export class TaskDetailService {
  constructor(private readonly prisma: PrismaService, private readonly access: TaskCollaborationAccess) {}

  async get(identity: AuthenticatedIdentity, workspaceId: string, taskId: string) {
    await this.access.require(identity, workspaceId, taskId);
    const task = await this.prisma.task.findFirst({ where: { id: taskId, workspaceId }, include: {
      project: { select: { id: true, name: true } }, assignee: { select: { id: true, displayName: true } },
      _count: { select: { comments: true, checklistItems: true, followers: true } },
    } });
    if (!task) return null;
    const { _count, ...record } = task;
    return { ...record, collaboration: { comments: _count.comments, checklistItems: _count.checklistItems, followers: _count.followers } };
  }
}
