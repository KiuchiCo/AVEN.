import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../../auth/auth.types.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { TaskContext } from './task-collaboration.types.js';

@Injectable()
export class TaskCollaborationAccess {
  constructor(private readonly prisma: PrismaService) {}

  async require(identity: AuthenticatedIdentity, workspaceId: string, taskId: string, write = false): Promise<TaskContext> {
    const user = await this.prisma.user.findUnique({ where: { identityIssuer_identitySubject: { identityIssuer: identity.issuer, identitySubject: identity.subject } }, select: { id: true } });
    if (!user) throw new ForbiddenException('Your AVEN account is not connected to a workspace yet.');
    const membership = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } }, select: { role: true } });
    if (!membership) throw new NotFoundException('Workspace not found.');
    if (write && membership.role === 'GUEST') throw new ForbiddenException('Guest members have read-only access to this workspace.');
    const task = await this.prisma.task.findFirst({ where: { id: taskId, workspaceId }, select: { id: true, title: true } });
    if (!task) throw new NotFoundException('Task not found in this workspace.');
    return { userId: user.id, task };
  }

}
