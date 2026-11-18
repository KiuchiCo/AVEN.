import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class TaskMentionService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(workspaceId: string, userIds: string[]) {
    if (new Set(userIds).size !== userIds.length) throw new BadRequestException('A workspace member can only be mentioned once.');
    if (!userIds.length) return [];
    const members = await this.prisma.workspaceMember.findMany({ where: { workspaceId, userId: { in: userIds } }, select: { userId: true, user: { select: { displayName: true } } } });
    if (members.length !== userIds.length) throw new NotFoundException('One or more mentioned people are not in this workspace.');
    return members.map((member) => ({ id: member.userId, displayName: member.user.displayName }));
  }
}
