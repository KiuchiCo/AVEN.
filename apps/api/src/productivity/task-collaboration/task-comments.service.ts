import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../../auth/auth.types.js';
import { PrismaService } from '../../database/prisma.service.js';
import { TaskCollaborationAccess } from './task-collaboration.access.js';
import { cleanText, memberIds, objectBody } from './task-collaboration.input.js';
import { TaskCollaborationNotifications } from './task-collaboration.notifications.js';
import { TaskMentionService } from './task-mention.service.js';

@Injectable()
export class TaskCommentsService {
  constructor(private readonly prisma: PrismaService, private readonly access: TaskCollaborationAccess, private readonly notifications: TaskCollaborationNotifications, private readonly mentions: TaskMentionService) {}

  async list(identity: AuthenticatedIdentity, workspaceId: string, taskId: string) {
    await this.access.require(identity, workspaceId, taskId);
    return this.prisma.taskComment.findMany({ where: { workspaceId, taskId }, orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, displayName: true } } } });
  }

  async create(identity: AuthenticatedIdentity, workspaceId: string, taskId: string, input: unknown) {
    const { userId, task } = await this.access.require(identity, workspaceId, taskId, true);
    const body = objectBody(input);
    const text = cleanText(body.body, 'Comment', 2000);
    const mentionedUserIds = memberIds(body.mentionedUserIds);
    await this.mentions.validate(workspaceId, mentionedUserIds);
    const comment = await this.prisma.taskComment.create({ data: { workspaceId, taskId, authorId: userId, body: text, mentionedUserIds }, include: { author: { select: { id: true, displayName: true } } } });
    await this.notifications.notify({ workspaceId, taskId, actorId: userId, entityType: 'TASK_COMMENT', message: `commented on task “${task.title}”`, mentionedUserIds });
    return comment;
  }

  async update(identity: AuthenticatedIdentity, workspaceId: string, taskId: string, commentId: string, input: unknown) {
    const { userId, task } = await this.access.require(identity, workspaceId, taskId, true);
    const body = objectBody(input);
    const comment = await this.prisma.taskComment.findFirst({ where: { id: commentId, taskId, workspaceId }, select: { id: true, authorId: true, body: true, mentionedUserIds: true } });
    if (!comment) throw new NotFoundException('Comment not found on this task.');
    if (comment.authorId !== userId) throw new ForbiddenException('Only the person who wrote a comment can edit it.');
    const mentionedUserIds = memberIds(body.mentionedUserIds);
    await this.mentions.validate(workspaceId, mentionedUserIds);
    const text = cleanText(body.body, 'Comment', 2000);
    const addedMentions = mentionedUserIds.filter((mentionedId) => !comment.mentionedUserIds.includes(mentionedId));
    const updated = await this.prisma.taskComment.update({ where: { id: commentId }, data: { body: text, mentionedUserIds }, include: { author: { select: { id: true, displayName: true } } } });
    if (text !== comment.body || mentionedUserIds.length !== comment.mentionedUserIds.length || addedMentions.length) {
      await this.notifications.notify({ workspaceId, taskId, actorId: userId, entityType: 'TASK_COMMENT', message: `updated a comment on task “${task.title}”`, mentionedUserIds: addedMentions });
    }
    return updated;
  }

  async remove(identity: AuthenticatedIdentity, workspaceId: string, taskId: string, commentId: string) {
    const { userId, task } = await this.access.require(identity, workspaceId, taskId, true);
    const comment = await this.prisma.taskComment.findFirst({ where: { id: commentId, taskId, workspaceId }, select: { id: true, authorId: true, mentionedUserIds: true } });
    if (!comment) throw new NotFoundException('Comment not found on this task.');
    if (comment.authorId !== userId) throw new ForbiddenException('Only the person who wrote a comment can delete it.');
    await this.prisma.taskComment.delete({ where: { id: commentId } });
    await this.notifications.notify({ workspaceId, taskId, actorId: userId, entityType: 'TASK_COMMENT', message: `deleted a comment from task “${task.title}”`, mentionedUserIds: comment.mentionedUserIds });
    return { id: commentId, deleted: true };
  }
}
