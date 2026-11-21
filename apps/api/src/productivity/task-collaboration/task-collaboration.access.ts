import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../../auth/auth.types.js';
import { requireWorkspaceMember } from '../../auth/workspace-access.js';
import { PrismaService } from '../../database/prisma.service.js';
import { visibleTaskWhere } from '../project-rules.js';
import type { TaskContext } from './task-collaboration.types.js';

@Injectable()
export class TaskCollaborationAccess {
  constructor(private readonly prisma: PrismaService) {}

  async require(identity: AuthenticatedIdentity, workspaceId: string, taskId: string, write = false): Promise<TaskContext> {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, write);
    const member = await this.prisma.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } });
    // a task in a team-only project is invisible (404) to people outside that team, for reading and for every change made through its comments, checklist and followers
    const task = await this.prisma.task.findFirst({ where: { id: taskId, workspaceId, ...visibleTaskWhere({ userId, role: member.role }) }, select: { id: true, title: true } });
    if (!task) throw new NotFoundException('Task not found in this workspace.');
    return { userId, task };
  }

}
