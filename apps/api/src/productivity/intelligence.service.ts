import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
    const [tasks, projects, events, documentCount, databaseCount, knowledgeCount] = await Promise.all([
      this.prisma.task.findMany({
        where: { workspaceId }, orderBy: [{ dueAt: 'asc' }, { priority: 'desc' }], take: 500,
        select: { id: true, title: true, status: true, priority: true, dueAt: true, project: { select: { name: true } } },
      }),
      this.prisma.project.findMany({
        where: { workspaceId }, orderBy: [{ dueAt: 'asc' }, { updatedAt: 'desc' }], take: 200,
        select: { id: true, name: true, status: true, dueAt: true, updatedAt: true, _count: { select: { tasks: true } } },
      }),
      this.prisma.calendarEvent.findMany({
        where: { workspaceId, OR: [{ startsAt: { gte: start, lt: end } }, { recurrence: { not: null } }] }, orderBy: { startsAt: 'asc' }, take: 100,
        select: { id: true, title: true, startsAt: true, endsAt: true, recurrence: true, recurrenceInterval: true, recurrenceUntil: true, recurrenceTimeZone: true, task: { select: { title: true } } },
      }),
      this.prisma.document.count({ where: { workspaceId } }),
      this.prisma.workspaceDatabase.count({ where: { workspaceId } }),
      this.prisma.knowledgeItem.count({ where: { workspaceId, archivedAt: null } }),
    ]);
    const open = tasks.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status));
    const overdue = open.filter((task) => task.dueAt && task.dueAt < start);
    const dueThisWeek = open.filter((task) => task.dueAt && task.dueAt >= start && task.dueAt < end);
    const activeProjects = projects.filter((project) => ['PLANNING', 'IN_PROGRESS', 'ON_HOLD'].includes(project.status));
    const dueProjects = activeProjects.filter((project) => project.dueAt && project.dueAt >= start && project.dueAt < end);
    const upcomingEvents = events.flatMap((event) => expandRecurringEvent(event, start, end));
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
      summary: { openTasks: open.length, overdueTasks: overdue.length, dueThisWeek: dueThisWeek.length + dueProjects.length, activeProjects: activeProjects.length, eventsThisWeek: upcomingEvents.length, documents: documentCount, databases: databaseCount, knowledge: knowledgeCount },
      insights: insights.slice(0, 4),
      focusTasks,
      events: upcomingEvents.map((event) => ({ ...event, taskTitle: event.task?.title ?? null })),
      upcomingProjects: dueProjects.slice(0, 5),
    };
  }

  async createPlan(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const user = await this.prisma.user.findUnique({
      where: { identityIssuer_identitySubject: { identityIssuer: identity.issuer, identitySubject: identity.subject } },
      select: { id: true },
    });
    if (!user) throw new ForbiddenException('Your AVEN account is not connected to a workspace yet.');
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.id } }, select: { userId: true },
    });
    if (!membership) throw new NotFoundException('Workspace not found.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('A project plan is required.');
    const body = input as Record<string, unknown>;
    const name = requiredText(body.name, 'Project name', 160);
    const description = optionalText(body.description, 'Project goal', 5000);
    const dueAt = optionalDate(body.dueAt, 'Project due date');
    const tasks = titleList(body.tasks, 'Tasks', 30, 200);
    const milestones = titleList(body.milestones, 'Milestones', 20, 160);
    if (!tasks.length && !milestones.length) throw new BadRequestException('Add at least one task or milestone to the plan.');

    return this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.create({
        data: { workspaceId, createdById: user.id, name, description, dueAt, status: 'PLANNING' },
      });
      if (tasks.length) await transaction.task.createMany({
        data: tasks.map((title) => ({ workspaceId, projectId: project.id, createdById: user.id, title, status: 'TODO', priority: 'MEDIUM' })),
      });
      if (milestones.length) await transaction.projectMilestone.createMany({
        data: milestones.map((title) => ({ workspaceId, projectId: project.id, title, dueAt: null })),
      });
      await transaction.workspaceActivity.create({
        data: { workspaceId, actorId: user.id, entityType: 'PROJECT', entityId: project.id, message: `created project plan “${name}”` },
      });
      const created = await transaction.project.findUniqueOrThrow({ where: { id: project.id }, include: { tasks: { orderBy: { createdAt: 'asc' }, select: { id: true, title: true, status: true } }, milestones: { orderBy: { createdAt: 'asc' }, select: { id: true, title: true } } } });
      return { project: created, tasksCreated: tasks.length, milestonesCreated: milestones.length };
    });
  }
}

type BriefingEvent = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  recurrence: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;
  recurrenceInterval: number;
  recurrenceUntil: Date | null;
  recurrenceTimeZone: string | null;
  task: { title: string } | null;
};

function expandRecurringEvent(event: BriefingEvent, start: Date, end: Date) {
  const duration = event.endsAt ? event.endsAt.getTime() - event.startsAt.getTime() : null;
  if (!event.recurrence) return event.startsAt >= start && event.startsAt < end ? [event] : [];
  const until = event.recurrenceUntil ?? event.startsAt;
  const occurrences: BriefingEvent[] = [];
  const timeZone = event.recurrenceTimeZone ?? 'UTC';
  const anchor = zonedParts(event.startsAt, timeZone);
  const anchorDay = anchor.day;
  let parts = anchor;
  let cursor = new Date(event.startsAt);
  let count = 0;
  while (cursor <= until && cursor < end && count < 750) {
    if (cursor >= start) occurrences.push({ ...event, id: `${event.id}-${cursor.toISOString()}`, startsAt: new Date(cursor), endsAt: duration === null ? null : new Date(cursor.getTime() + duration) });
    const nextParts = advanceZonedParts(parts, event.recurrence, event.recurrenceInterval, anchorDay);
    const next = dateInTimeZone(nextParts, timeZone);
    if (next <= cursor) break;
    cursor = next; parts = nextParts; count += 1;
  }
  return occurrences;
}

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  const values = Object.fromEntries(formatted.map(({ type, value }) => [type, Number(value)]));
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute, second: values.second };
}

function dateInTimeZone(parts: ZonedParts, timeZone: string) {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let timestamp = desired;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const actual = zonedParts(new Date(timestamp), timeZone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const correction = desired - represented;
    if (!correction) break;
    timestamp += correction;
  }
  return new Date(timestamp);
}

function advanceZonedParts(parts: ZonedParts, frequency: string, interval: number, anchorDay: number): ZonedParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (frequency === 'DAILY') date.setUTCDate(date.getUTCDate() + interval);
  else if (frequency === 'WEEKLY') date.setUTCDate(date.getUTCDate() + interval * 7);
  else {
    date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + interval);
    date.setUTCDate(Math.min(anchorDay, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
  }
  return { ...parts, year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function requiredText(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} must be between 1 and ${max} characters.`);
  return value.trim();
}

function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw new BadRequestException(`${label} must be ${max} characters or fewer.`);
  return value.trim() || null;
}

function optionalDate(value: unknown, label: string) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new BadRequestException(`${label} is invalid.`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new BadRequestException(`${label} is invalid.`);
  return parsed;
}

function titleList(value: unknown, label: string, maxItems: number, maxLength: number) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new BadRequestException(`${label} must contain at most ${maxItems} items.`);
  return value.map((item) => requiredText(item, `${label.slice(0, -1)} title`, maxLength));
}
