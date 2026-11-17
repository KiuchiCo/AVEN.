import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class IntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  async briefing(identity: AuthenticatedIdentity, workspaceId: string) {
    const user = await this.prisma.user.findUnique({
      where: { identityIssuer_identitySubject: { identityIssuer: identity.issuer, identitySubject: identity.subject } },
      select: { id: true },
    });
    if (!user) throw new ForbiddenException('Your AVEN account is not connected to a workspace yet.');
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.id } }, select: { userId: true },
    });
    if (!membership) throw new NotFoundException('Workspace not found.');

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [tasks, projects, events, documentCount, databaseCount] = await Promise.all([
      this.prisma.task.findMany({
        where: { workspaceId }, orderBy: [{ dueAt: 'asc' }, { priority: 'desc' }], take: 500,
        select: { id: true, title: true, status: true, priority: true, dueAt: true, project: { select: { name: true } } },
      }),
      this.prisma.project.findMany({
        where: { workspaceId }, orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }], take: 200,
        select: { id: true, name: true, status: true, dueAt: true, updatedAt: true, _count: { select: { tasks: true } } },
      }),
      this.prisma.calendarEvent.findMany({
        where: { workspaceId, startsAt: { gte: start, lt: end } }, orderBy: { startsAt: 'asc' }, take: 100,
        select: { id: true, title: true, startsAt: true, endsAt: true, task: { select: { title: true } } },
      }),
      this.prisma.document.count({ where: { workspaceId } }),
      this.prisma.workspaceDatabase.count({ where: { workspaceId } }),
    ]);
    const open = tasks.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status));
    const overdue = open.filter((task) => task.dueAt && task.dueAt < start);
    const dueThisWeek = open.filter((task) => task.dueAt && task.dueAt >= start && task.dueAt < end);
    const activeProjects = projects.filter((project) => ['PLANNING', 'IN_PROGRESS', 'ON_HOLD'].includes(project.status));
    const dueProjects = activeProjects.filter((project) => project.dueAt && project.dueAt >= start && project.dueAt < end);
    const insights = [];
    if (overdue.length) insights.push({ id: 'overdue', tone: 'urgent', title: `${overdue.length} overdue ${overdue.length === 1 ? 'task' : 'tasks'}`, detail: `The earliest is “${overdue[0].title}”. Review its date or move it forward.`, href: '/workspace/tasks', action: 'Review tasks' });
    if (dueThisWeek.length || dueProjects.length) insights.push({ id: 'deadlines', tone: 'warm', title: `${dueThisWeek.length + dueProjects.length} deadlines in the next 7 days`, detail: `${dueThisWeek.length} task${dueThisWeek.length === 1 ? '' : 's'} and ${dueProjects.length} project${dueProjects.length === 1 ? '' : 's'} have dates coming up.`, href: '/workspace/tasks', action: 'See deadlines' });
    if (!overdue.length && !dueThisWeek.length && !dueProjects.length) insights.push({ id: 'clear', tone: 'calm', title: 'Your next 7 days look clear', detail: 'No overdue tasks or upcoming project and task deadlines are on record.', href: '/workspace/calendar', action: 'Open calendar' });
    if (activeProjects.some((project) => project.status === 'ON_HOLD')) {
      const paused = activeProjects.filter((project) => project.status === 'ON_HOLD');
      insights.push({ id: 'paused', tone: 'warm', title: `${paused.length} project${paused.length === 1 ? '' : 's'} on hold`, detail: `“${paused[0].name}” is paused. Check whether it needs a new owner or next step.`, href: '/workspace/projects', action: 'Review projects' });
    }
    const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const focusTasks = [...open].sort((a, b) => {
      const aOverdue = a.dueAt && a.dueAt < start ? 0 : 1;
      const bOverdue = b.dueAt && b.dueAt < start ? 0 : 1;
      return aOverdue - bOverdue || priorityOrder[a.priority] - priorityOrder[b.priority] || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity);
    }).slice(0, 6).map((task) => ({ ...task, projectName: task.project?.name ?? null }));
    return {
      generatedAt: now,
      horizonEndsAt: end,
      summary: { openTasks: open.length, overdueTasks: overdue.length, dueThisWeek: dueThisWeek.length + dueProjects.length, activeProjects: activeProjects.length, eventsThisWeek: events.length, documents: documentCount, databases: databaseCount },
      insights: insights.slice(0, 4),
      focusTasks,
      events: events.map((event) => ({ ...event, taskTitle: event.task?.title ?? null })),
      upcomingProjects: dueProjects.slice(0, 5),
    };
  }
}
