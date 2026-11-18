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
      dependsOn: { select: { id: true, title: true, status: true } },
      blocks: { select: { id: true, title: true, status: true } },
      _count: { select: { comments: true, checklistItems: true, followers: true } },
    } });
    if (!task) return null;
    const { _count, ...record } = task;
    return { ...record, collaboration: { comments: _count.comments, checklistItems: _count.checklistItems, followers: _count.followers } };
  }

  async activity(identity: AuthenticatedIdentity, workspaceId: string, taskId: string) {
    await this.access.require(identity, workspaceId, taskId);
    return this.prisma.workspaceActivity.findMany({
      where: { workspaceId, entityId: taskId, entityType: { in: ['TASK', 'TASK_COMMENT', 'TASK_CHECKLIST'] } },
      orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, entityType: true, message: true, createdAt: true, actor: { select: { id: true, displayName: true } } },
    });
  }
}
