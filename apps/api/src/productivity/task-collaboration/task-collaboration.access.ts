import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../../auth/auth.types.js';
import { requireWorkspaceMember } from '../../auth/workspace-access.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { TaskContext } from './task-collaboration.types.js';

@Injectable()
export class TaskCollaborationAccess {
  constructor(private readonly prisma: PrismaService) {}

  async require(identity: AuthenticatedIdentity, workspaceId: string, taskId: string, write = false): Promise<TaskContext> {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, write);
    const task = await this.prisma.task.findFirst({ where: { id: taskId, workspaceId }, select: { id: true, title: true } });
    if (!task) throw new NotFoundException('Task not found in this workspace.');
    return { userId, task };
  }

}
