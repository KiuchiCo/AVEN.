import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../../auth/auth.types.js';
import { PrismaService } from '../../database/prisma.service.js';
import { TaskCollaborationAccess } from './task-collaboration.access.js';

@Injectable()
export class TaskFollowersService {
  constructor(private readonly prisma: PrismaService, private readonly access: TaskCollaborationAccess) {}

  async list(identity: AuthenticatedIdentity, workspaceId: string, taskId: string) {
    await this.access.require(identity, workspaceId, taskId);
    return this.prisma.taskFollower.findMany({ where: { workspaceId, taskId }, orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, displayName: true, email: true } } } }).then((rows) => rows.map((row) => ({ ...row.user, followedAt: row.createdAt })));
  }

  async setFollowing(identity: AuthenticatedIdentity, workspaceId: string, taskId: string, following: boolean) {
    const { userId } = await this.access.require(identity, workspaceId, taskId, true);
    if (typeof following !== 'boolean') throw new BadRequestException('following must be a boolean.');
    if (following) await this.prisma.taskFollower.upsert({ where: { taskId_userId: { taskId, userId } }, create: { workspaceId, taskId, userId }, update: {} });
    else await this.prisma.taskFollower.deleteMany({ where: { workspaceId, taskId, userId } });
    return { following };
  }
}
