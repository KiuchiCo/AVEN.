import { Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { PrismaService } from '../database/prisma.service.js';
import { workspaceNotificationWhere } from './notification-filter.js';

/** Workspace data for the Home dashboard that the Intelligence briefing does not already provide. */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(identity: AuthenticatedIdentity, workspaceId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const preferences = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { notifyTeamActivity: true, notifyTaskUpdates: true, dashboardHiddenWidgets: true },
    });
    const inbox = workspaceNotificationWhere(workspaceId, userId, preferences);

    const [myTasks, projects, documents, activity, unreadInbox] = await Promise.all([
      this.prisma.task.findMany({
        where: { workspaceId, assigneeId: userId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }], take: 6,
        select: { id: true, title: true, status: true, priority: true, dueAt: true, project: { select: { id: true, name: true } } },
      }),
      this.prisma.project.findMany({
        where: { workspaceId, status: { in: ['PLANNING', 'IN_PROGRESS', 'ON_HOLD'] } },
        orderBy: { updatedAt: 'desc' }, take: 5,
        select: { id: true, name: true, status: true, dueAt: true, _count: { select: { tasks: true } }, tasks: { where: { status: 'COMPLETED' }, select: { id: true } } },
      }),
      this.prisma.document.findMany({
        where: { workspaceId }, orderBy: { updatedAt: 'desc' }, take: 5,
        select: { id: true, title: true, updatedAt: true, project: { select: { name: true } } },
      }),
      this.prisma.workspaceActivity.findMany({
        where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 6,
        select: { id: true, entityType: true, entityId: true, message: true, createdAt: true, actor: { select: { displayName: true } } },
      }),
      this.prisma.workspaceActivity.count({
        where: { AND: [inbox, { NOT: { receipts: { some: { userId, readAt: { not: null } } } } }] },
      }),
    ]);

    return {
      hiddenWidgets: preferences.dashboardHiddenWidgets,
      unreadInbox,
      myTasks: myTasks.map((task) => ({ ...task, projectName: task.project?.name ?? null })),
      projects: projects.map(({ tasks, _count, ...project }) => ({ ...project, taskCount: _count.tasks, completedTaskCount: tasks.length })),
      recentDocuments: documents.map(({ project, ...document }) => ({ ...document, projectName: project?.name ?? null })),
      recentActivity: activity,
    };
  }
}
