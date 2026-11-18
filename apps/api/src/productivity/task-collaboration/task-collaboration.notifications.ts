import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class TaskCollaborationNotifications {
  constructor(private readonly prisma: PrismaService) {}

  async notify(input: { workspaceId: string; taskId: string; actorId: string; entityType: string; message: string; mentionedUserIds?: string[] }) {
    const followers = await this.prisma.taskFollower.findMany({ where: { workspaceId: input.workspaceId, taskId: input.taskId }, select: { userId: true } });
    const userIds = [...new Set([...followers.map((follower) => follower.userId), ...(input.mentionedUserIds ?? [])])].filter((id) => id !== input.actorId);
    const activity = await this.prisma.workspaceActivity.create({ data: { workspaceId: input.workspaceId, actorId: input.actorId, entityType: input.entityType, entityId: input.taskId, message: input.message.replace(/\s+/g, ' ').trim().slice(0, 240), recipientScoped: true } });
    if (userIds.length) await this.prisma.activityReceipt.createMany({ data: userIds.map((userId) => ({ activityId: activity.id, userId, isNotificationTarget: true })), skipDuplicates: true });
    return activity;
  }
}
