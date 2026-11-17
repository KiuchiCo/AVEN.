import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';

const projectStatuses = ['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as const;
const taskStatuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED'] as const;
const taskPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

type ProjectStatus = (typeof projectStatuses)[number];
type TaskStatus = (typeof taskStatuses)[number];
type TaskPriority = (typeof taskPriorities)[number];

@Injectable()
export class ProductivityService {
  constructor(private readonly prisma: PrismaService) {}

  async listProjects(identity: AuthenticatedIdentity, workspaceId: string) {
    const userId = await this.requireMembership(identity, workspaceId);
    return this.prisma.project.findMany({
      where: { workspaceId },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { tasks: true } } },
    }).then((projects) => projects.map(({ _count, ...project }) => ({ ...project, taskCount: _count.tasks })));
  }

  async createProject(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await this.requireMembership(identity, workspaceId);
    const body = objectInput(input);
    const name = textField(body.name, 'Project name', 160);
    const description = optionalText(body.description, 'Project description', 5000);
    const status = enumField(body.status, projectStatuses, 'Project status', 'PLANNING');
    const dueAt = dateField(body.dueAt, 'Due date');
    return this.prisma.project.create({
      data: { workspaceId, createdById: userId, name, description, status, dueAt },
    });
  }

  async listTasks(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.requireMembership(identity, workspaceId);
    return this.prisma.task.findMany({
      where: { workspaceId },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async createTask(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await this.requireMembership(identity, workspaceId);
    const body = objectInput(input);
    const projectId = optionalUuid(body.projectId, 'Project');
    if (projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
      if (!project) throw new NotFoundException('Project not found in this workspace.');
    }
    const status = enumField(body.status, taskStatuses, 'Task status', 'TODO');
    const priority = enumField(body.priority, taskPriorities, 'Task priority', 'MEDIUM');
    return this.prisma.task.create({
      data: {
        workspaceId,
        createdById: userId,
        projectId,
        title: textField(body.title, 'Task title', 200),
        description: optionalText(body.description, 'Task description', 5000),
        status,
        priority,
        dueAt: dateField(body.dueAt, 'Due date'),
        completedAt: status === 'COMPLETED' ? new Date() : null,
      },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async updateTask(identity: AuthenticatedIdentity, workspaceId: string, taskId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId);
    const body = objectInput(input);
    const data: {
      title?: string;
      description?: string | null;
      status?: TaskStatus;
      priority?: TaskPriority;
      dueAt?: Date | null;
      completedAt?: Date | null;
    } = {};

    if ('title' in body) data.title = textField(body.title, 'Task title', 200);
    if ('description' in body) data.description = optionalText(body.description, 'Task description', 5000);
    if ('status' in body) {
      data.status = enumField(body.status, taskStatuses, 'Task status');
      data.completedAt = data.status === 'COMPLETED' ? new Date() : null;
    }
    if ('priority' in body) data.priority = enumField(body.priority, taskPriorities, 'Task priority');
    if ('dueAt' in body) data.dueAt = dateField(body.dueAt, 'Due date');
    if (!Object.keys(data).length) throw new BadRequestException('Provide at least one task field to update.');

    const result = await this.prisma.task.updateMany({ where: { id: taskId, workspaceId }, data });
    if (result.count !== 1) throw new NotFoundException('Task not found in this workspace.');
    return this.prisma.task.findFirstOrThrow({
      where: { id: taskId, workspaceId },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async listDocuments(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.requireMembership(identity, workspaceId);
    return this.prisma.document.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async createDocument(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId);
    const body = objectInput(input);
    const projectId = optionalUuid(body.projectId, 'Project');
    if (projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
      if (!project) throw new NotFoundException('Project not found in this workspace.');
    }
    return this.prisma.document.create({
      data: {
        workspaceId,
        projectId,
        title: textField(body.title, 'Document title', 200),
        content: typeof body.content === 'string' && body.content.length <= 20000 ? body.content : invalidText('Document content must be 20,000 characters or fewer.'),
      },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async listCalendarEvents(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.requireMembership(identity, workspaceId);
    return this.prisma.calendarEvent.findMany({
      where: { workspaceId },
      orderBy: { startsAt: 'asc' },
      include: { task: { select: { id: true, title: true } } },
    });
  }

  async createCalendarEvent(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId);
    const body = objectInput(input);
    const taskId = optionalUuid(body.taskId, 'Task');
    if (taskId) {
      const task = await this.prisma.task.findFirst({ where: { id: taskId, workspaceId }, select: { id: true, title: true } });
      if (!task) throw new NotFoundException('Task not found in this workspace.');
    }
    const startsAt = requiredDate(body.startsAt, 'Start time');
    const endsAt = dateField(body.endsAt, 'End time');
    if (endsAt && endsAt <= startsAt) throw new BadRequestException('End time must be after the start time.');
    return this.prisma.calendarEvent.create({
      data: {
        workspaceId,
        taskId,
        title: textField(body.title, 'Event title', 200),
        startsAt,
        endsAt,
      },
      include: { task: { select: { id: true, title: true } } },
    });
  }

  private async requireMembership(identity: AuthenticatedIdentity, workspaceId: string) {
    const user = await this.prisma.user.findUnique({
      where: { identityIssuer_identitySubject: { identityIssuer: identity.issuer, identitySubject: identity.subject } },
      select: { id: true },
    });
    if (!user) throw new ForbiddenException('Your AVEN account is not connected to a workspace yet.');
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      select: { userId: true },
    });
    if (!membership) throw new NotFoundException('Workspace not found.');
    return user.id;
  }
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('A JSON object is required.');
  return input as Record<string, unknown>;
}

function textField(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(`${label} must be between 1 and ${max} characters.`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string, max: number) {
  if (value === undefined || value === null || value === '') return null;
  return textField(value, label, max);
}

function enumField<const T extends readonly string[]>(value: unknown, choices: T, label: string, fallback?: T[number]): T[number] {
  if (value === undefined && fallback) return fallback;
  if (typeof value !== 'string' || !choices.includes(value)) throw new BadRequestException(`${label} is invalid.`);
  return value as T[number];
}

function dateField(value: unknown, label: string) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new BadRequestException(`${label} must be a valid date.`);
  return new Date(value);
}

function requiredDate(value: unknown, label: string) {
  const date = dateField(value, label);
  if (!date) throw new BadRequestException(`${label} is required.`);
  return date;
}

function invalidText(message: string): never {
  throw new BadRequestException(message);
}

function optionalUuid(value: unknown, label: string) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException(`${label} reference is invalid.`);
  }
  return value;
}
