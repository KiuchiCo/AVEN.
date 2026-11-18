import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AutomationsService } from './automations.service.js';

const projectStatuses = ['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as const;
const taskStatuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED'] as const;
const taskPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const calendarRecurrences = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
const calendarEventTypes = ['MEETING', 'FOCUS', 'PERSONAL', 'REMINDER', 'OTHER'] as const;

type ProjectStatus = (typeof projectStatuses)[number];
type TaskStatus = (typeof taskStatuses)[number];
type TaskPriority = (typeof taskPriorities)[number];
type TaskViewFilterSet = { projectId: string; search: string; status: string; priority: string; assigneeId: string; label: string; due: string; dependency: string; sort: string };
const taskViewStatuses = ['ALL', ...taskStatuses] as const;
const taskViewPriorities = ['ALL', ...taskPriorities] as const;
const taskViewDueFilters = ['ALL', 'OVERDUE', 'TODAY', 'NEXT_7_DAYS', 'NO_DATE'] as const;
const taskViewDependencyFilters = ['ALL', 'BLOCKED', 'BLOCKING', 'HAS_DEPENDENCIES', 'NONE'] as const;
const taskViewSorts = ['DUE_ASC', 'DUE_DESC', 'PRIORITY', 'TITLE'] as const;

@Injectable()
export class ProductivityService {
  constructor(private readonly prisma: PrismaService, private readonly automations: AutomationsService) {}

  async listProjects(identity: AuthenticatedIdentity, workspaceId: string) {
    const userId = await this.requireMembership(identity, workspaceId);
    return this.prisma.project.findMany({
      where: { workspaceId },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { tasks: true } } },
    }).then((projects) => projects.map(({ _count, ...project }) => ({ ...project, taskCount: _count.tasks })));
  }

  async listProjectTemplates(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.requireMembership(identity, workspaceId);
    const templates = await this.prisma.projectTemplate.findMany({ where: { workspaceId }, orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }], include: { createdBy: { select: { displayName: true } } } });
    return templates.map((template) => ({ ...template, taskCount: parseTemplateTasks(template.taskTemplates).length, milestoneCount: parseTemplateMilestones(template.milestoneTemplates).length }));
  }

  async updateProjectTemplate(identity: AuthenticatedIdentity, workspaceId: string, templateId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const data: Prisma.ProjectTemplateUpdateManyMutationInput = {};
    if ('name' in body) data.name = textField(body.name, 'Template name', 160);
    if ('description' in body) data.description = optionalText(body.description, 'Template description', 5000);
    if ('taskTemplates' in body) data.taskTemplates = parseTemplateTasks(body.taskTemplates as Prisma.JsonValue) as Prisma.InputJsonValue;
    if ('milestoneTemplates' in body) data.milestoneTemplates = parseTemplateMilestones(body.milestoneTemplates as Prisma.JsonValue) as Prisma.InputJsonValue;
    if (!Object.keys(data).length) throw new BadRequestException('Provide at least one template field to update.');
    const result = await this.prisma.projectTemplate.updateMany({ where: { id: templateId, workspaceId }, data });
    if (result.count !== 1) throw new NotFoundException('Project template not found in this workspace.');
    const template = await this.prisma.projectTemplate.findFirstOrThrow({ where: { id: templateId, workspaceId }, include: { createdBy: { select: { displayName: true } } } });
    await this.recordActivity(workspaceId, actorId, 'PROJECT', template.id, `updated the “${template.name}” project template`);
    return { ...template, taskCount: parseTemplateTasks(template.taskTemplates).length, milestoneCount: parseTemplateMilestones(template.milestoneTemplates).length };
  }

  async createProjectTemplate(identity: AuthenticatedIdentity, workspaceId: string, projectId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const name = textField(body.name, 'Template name', 160);
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true, description: true, name: true } });
    if (!project) throw new NotFoundException('Project not found in this workspace.');
    const [projectTasks, milestones] = await Promise.all([
      this.prisma.task.findMany({ where: { projectId, workspaceId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100, select: { id: true, title: true, description: true, priority: true, labels: true, dueAt: true, dependsOn: { select: { id: true } } } }),
      this.prisma.projectMilestone.findMany({ where: { projectId, workspaceId }, orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }], take: 50, select: { title: true, dueAt: true } }),
    ]);
    const taskIndexes = new Map(projectTasks.map((task, index) => [task.id, index]));
    const tasks = projectTasks.map((task) => ({ title: task.title, description: task.description, priority: task.priority, labels: task.labels, daysFromToday: task.dueAt ? dayOffsetFromToday(task.dueAt) : null, dependsOnIndexes: task.dependsOn.map((dependency) => taskIndexes.get(dependency.id)).filter((index): index is number => index !== undefined) }));
    const template = await this.prisma.projectTemplate.create({
      data: { workspaceId, createdById: actorId, name, description: project.description, taskTemplates: tasks as Prisma.InputJsonValue, milestoneTemplates: milestones.map((milestone) => ({ title: milestone.title, daysFromToday: milestone.dueAt ? dayOffsetFromToday(milestone.dueAt) : null })) as Prisma.InputJsonValue },
      include: { createdBy: { select: { displayName: true } } },
    });
    await this.recordActivity(workspaceId, actorId, 'PROJECT', project.id, `saved “${project.name}” as the “${name}” project template`);
    return { ...template, taskCount: tasks.length, milestoneCount: milestones.length };
  }

  async applyProjectTemplate(identity: AuthenticatedIdentity, workspaceId: string, templateId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const name = textField(body.name, 'Project name', 160);
    const template = await this.prisma.projectTemplate.findFirst({ where: { id: templateId, workspaceId } });
    if (!template) throw new NotFoundException('Project template not found in this workspace.');
    const tasks = parseTemplateTasks(template.taskTemplates);
    const milestones = parseTemplateMilestones(template.milestoneTemplates);
    return this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.create({ data: { workspaceId, createdById: actorId, name, description: template.description, status: 'PLANNING' } });
      const createdTasks: { id: string }[] = [];
      const today = new Date();
      const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      for (const task of tasks) createdTasks.push(await transaction.task.create({ data: { workspaceId, projectId: project.id, createdById: actorId, title: task.title, description: task.description, priority: task.priority, labels: task.labels, status: 'TODO', dueAt: task.daysFromToday === null ? null : new Date(todayUtc.getTime() + task.daysFromToday * 86_400_000) }, select: { id: true } }));
      for (const [index, task] of tasks.entries()) if (task.dependsOnIndexes.length) await transaction.task.update({ where: { id: createdTasks[index].id }, data: { dependsOn: { connect: task.dependsOnIndexes.map((dependencyIndex) => ({ id: createdTasks[dependencyIndex].id })) } } });
      if (milestones.length) await transaction.projectMilestone.createMany({ data: milestones.map((milestone) => ({ workspaceId, projectId: project.id, title: milestone.title, dueAt: milestone.daysFromToday === null ? null : new Date(todayUtc.getTime() + milestone.daysFromToday * 86_400_000) })) });
      const usageUpdate = await transaction.projectTemplate.updateMany({ where: { id: templateId, workspaceId }, data: { useCount: { increment: 1 }, lastUsedAt: new Date() } });
      if (usageUpdate.count !== 1) throw new NotFoundException('Project template is no longer available in this workspace.');
      await transaction.workspaceActivity.create({ data: { workspaceId, actorId, entityType: 'PROJECT', entityId: project.id, message: `created project “${name}” from the “${template.name}” template` } });
      return { ...project, taskCount: tasks.length, milestoneCount: milestones.length };
    });
  }

  async deleteProjectTemplate(identity: AuthenticatedIdentity, workspaceId: string, templateId: string) {
    await this.requireMembership(identity, workspaceId, true);
    const result = await this.prisma.projectTemplate.deleteMany({ where: { id: templateId, workspaceId } });
    if (!result.count) throw new NotFoundException('Project template not found in this workspace.');
    return { id: templateId, deleted: true };
  }

  async duplicateProjectTemplate(identity: AuthenticatedIdentity, workspaceId: string, templateId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const source = await this.prisma.projectTemplate.findFirst({ where: { id: templateId, workspaceId } });
    if (!source) throw new NotFoundException('Project template not found in this workspace.');
    const name = 'name' in body ? textField(body.name, 'Template name', 160) : textField(`${source.name} copy`, 'Template name', 160);
    const template = await this.prisma.projectTemplate.create({
      data: { workspaceId, createdById: actorId, name, description: source.description, taskTemplates: parseTemplateTasks(source.taskTemplates) as Prisma.InputJsonValue, milestoneTemplates: parseTemplateMilestones(source.milestoneTemplates) as Prisma.InputJsonValue },
      include: { createdBy: { select: { displayName: true } } },
    });
    await this.recordActivity(workspaceId, actorId, 'PROJECT', template.id, `duplicated the “${source.name}” project template as “${name}”`);
    return { ...template, taskCount: parseTemplateTasks(template.taskTemplates).length, milestoneCount: parseTemplateMilestones(template.milestoneTemplates).length };
  }

  async importProjectTemplate(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const name = textField(body.name, 'Template name', 160);
    const description = optionalText(body.description, 'Template description', 5000);
    const tasks = parseTemplateTasks(body.taskTemplates as Prisma.JsonValue);
    const milestones = parseTemplateMilestones(body.milestoneTemplates as Prisma.JsonValue);
    const template = await this.prisma.projectTemplate.create({
      data: { workspaceId, createdById: actorId, name, description, taskTemplates: tasks as Prisma.InputJsonValue, milestoneTemplates: milestones as Prisma.InputJsonValue },
      include: { createdBy: { select: { displayName: true } } },
    });
    await this.recordActivity(workspaceId, actorId, 'PROJECT', template.id, `imported the “${name}” project template`);
    return { ...template, taskCount: tasks.length, milestoneCount: milestones.length };
  }

  async createProjectTemplateFromData(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const name = textField(body.name, 'Template name', 160);
    const description = optionalText(body.description, 'Template description', 5000);
    const tasks = parseTemplateTasks(body.taskTemplates as Prisma.JsonValue);
    const milestones = parseTemplateMilestones(body.milestoneTemplates as Prisma.JsonValue);
    const template = await this.prisma.projectTemplate.create({
      data: { workspaceId, createdById: actorId, name, description, taskTemplates: tasks as Prisma.InputJsonValue, milestoneTemplates: milestones as Prisma.InputJsonValue },
      include: { createdBy: { select: { displayName: true } } },
    });
    await this.recordActivity(workspaceId, actorId, 'PROJECT', template.id, `created the “${name}” project template`);
    return { ...template, taskCount: tasks.length, milestoneCount: milestones.length };
  }

  async listWorkspaceMembers(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.requireMembership(identity, workspaceId);
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId }, orderBy: { createdAt: 'asc' },
      select: { userId: true, role: true, user: { select: { displayName: true } } },
    });
    return members.map(({ user, ...membership }) => ({ ...membership, displayName: user.displayName }));
  }

  async listWorkspaceActivity(identity: AuthenticatedIdentity, workspaceId: string) {
    const userId = await this.requireMembership(identity, workspaceId);
    const entries = await this.prisma.workspaceActivity.findMany({
      where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { actor: { select: { displayName: true } }, receipts: { where: { userId }, select: { readAt: true } } },
    });
    return entries.map(({ receipts, ...entry }) => ({ ...entry, isRead: Boolean(receipts[0]?.readAt) }));
  }

  async listWorkspaceNotifications(identity: AuthenticatedIdentity, workspaceId: string) {
    const userId = await this.requireMembership(identity, workspaceId);
    const rows = await this.prisma.workspaceActivity.findMany({
      where: {
        workspaceId,
        actorId: { not: userId },
        OR: [
          { recipientScoped: false, entityType: { notIn: ['TASK_COMMENT', 'TASK_CHECKLIST'] } },
          { receipts: { some: { userId, isNotificationTarget: true } } },
        ],
      },
      orderBy: { createdAt: 'desc' }, take: 50,
      include: { actor: { select: { displayName: true } }, receipts: { where: { userId }, select: { readAt: true, dismissedAt: true } } },
    });
    return rows.filter((row) => !row.receipts[0]?.dismissedAt).map(({ receipts, ...row }) => ({ ...row, isRead: Boolean(receipts[0]?.readAt) }));
  }

  async markWorkspaceActivityRead(identity: AuthenticatedIdentity, workspaceId: string, activityId: string, read: boolean) {
    const userId = await this.requireMembership(identity, workspaceId);
    const activity = await this.prisma.workspaceActivity.findFirst({ where: { id: activityId, workspaceId }, select: { id: true } });
    if (!activity) throw new NotFoundException('Workspace activity not found.');
    await this.prisma.activityReceipt.upsert({
      where: { activityId_userId: { activityId, userId } },
      create: { activityId, userId, readAt: read ? new Date() : null },
      update: { readAt: read ? new Date() : null, dismissedAt: null },
    });
    return { id: activityId, isRead: read };
  }

  async dismissWorkspaceActivity(identity: AuthenticatedIdentity, workspaceId: string, activityId: string) {
    const userId = await this.requireMembership(identity, workspaceId);
    const activity = await this.prisma.workspaceActivity.findFirst({ where: { id: activityId, workspaceId }, select: { id: true } });
    if (!activity) throw new NotFoundException('Workspace activity not found.');
    await this.prisma.activityReceipt.upsert({
      where: { activityId_userId: { activityId, userId } },
      create: { activityId, userId, readAt: new Date(), dismissedAt: new Date() },
      update: { readAt: new Date(), dismissedAt: new Date() },
    });
    return { id: activityId, dismissed: true };
  }

  async markAllWorkspaceActivityRead(identity: AuthenticatedIdentity, workspaceId: string) {
    const userId = await this.requireMembership(identity, workspaceId);
    const activities = await this.prisma.workspaceActivity.findMany({ where: { workspaceId, actorId: { not: userId } }, select: { id: true } });
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.activityReceipt.createMany({ data: activities.map(({ id }) => ({ activityId: id, userId, readAt: now })), skipDuplicates: true });
      await transaction.activityReceipt.updateMany({ where: { userId, activityId: { in: activities.map(({ id }) => id) } }, data: { readAt: now } });
    });
    return { markedRead: activities.length };
  }

  async createProject(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const name = textField(body.name, 'Project name', 160);
    const description = optionalText(body.description, 'Project description', 5000);
    const status = enumField(body.status, projectStatuses, 'Project status', 'PLANNING');
    const dueAt = dateField(body.dueAt, 'Due date');
    const budgetTotalCents = moneyCentsField(body.budgetTotal, 'Project budget', true);
    const project = await this.prisma.project.create({
      data: { workspaceId, createdById: userId, name, description, status, dueAt, budgetTotalCents },
    });
    await this.recordActivity(workspaceId, userId, 'PROJECT', project.id, `created project “${project.name}”`);
    return project;
  }

  async updateProject(identity: AuthenticatedIdentity, workspaceId: string, projectId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const data: { name?: string; description?: string | null; status?: ProjectStatus; dueAt?: Date | null; budgetTotalCents?: number | null; budgetSpentCents?: number } = {};
    if ('name' in body) data.name = textField(body.name, 'Project name', 160);
    if ('description' in body) data.description = optionalText(body.description, 'Project description', 5000);
    if ('status' in body) data.status = enumField(body.status, projectStatuses, 'Project status');
    if ('dueAt' in body) data.dueAt = dateField(body.dueAt, 'Due date');
    if ('budgetTotal' in body) data.budgetTotalCents = moneyCentsField(body.budgetTotal, 'Project budget', true);
    if ('budgetSpent' in body) {
      const value = moneyCentsField(body.budgetSpent, 'Spent amount', false);
      if (value === null) throw new BadRequestException('Spent amount cannot be empty.');
      data.budgetSpentCents = value;
    }
    if (!Object.keys(data).length) throw new BadRequestException('Provide at least one project field to update.');
    const result = await this.prisma.project.updateMany({ where: { id: projectId, workspaceId }, data });
    if (result.count !== 1) throw new NotFoundException('Project not found in this workspace.');
    const project = await this.prisma.project.findFirstOrThrow({ where: { id: projectId, workspaceId } });
    await this.recordActivity(workspaceId, actorId, 'PROJECT', project.id, `updated project “${project.name}”`);
    return project;
  }

  async listProjectMilestones(identity: AuthenticatedIdentity, workspaceId: string, projectId: string) {
    await this.requireMembership(identity, workspaceId);
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
    if (!project) throw new NotFoundException('Project not found in this workspace.');
    return this.prisma.projectMilestone.findMany({
      where: { workspaceId, projectId },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createProjectMilestone(identity: AuthenticatedIdentity, workspaceId: string, projectId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
    if (!project) throw new NotFoundException('Project not found in this workspace.');
    const body = objectInput(input);
    const milestone = await this.prisma.projectMilestone.create({
      data: { workspaceId, projectId, title: textField(body.title, 'Milestone title', 160), dueAt: dateField(body.dueAt, 'Due date') },
    });
    await this.recordActivity(workspaceId, actorId, 'MILESTONE', milestone.id, `added milestone “${milestone.title}”`);
    return milestone;
  }

  async updateProjectMilestone(identity: AuthenticatedIdentity, workspaceId: string, projectId: string, milestoneId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const data: { title?: string; dueAt?: Date | null; completedAt?: Date | null } = {};
    if ('title' in body) data.title = textField(body.title, 'Milestone title', 160);
    if ('dueAt' in body) data.dueAt = dateField(body.dueAt, 'Due date');
    if ('completed' in body) {
      if (typeof body.completed !== 'boolean') throw new BadRequestException('Milestone completion must be true or false.');
      data.completedAt = body.completed ? new Date() : null;
    }
    if (!Object.keys(data).length) throw new BadRequestException('Provide a milestone field to update.');
    const result = await this.prisma.projectMilestone.updateMany({ where: { id: milestoneId, projectId, workspaceId }, data });
    if (result.count !== 1) throw new NotFoundException('Milestone not found in this project.');
    const milestone = await this.prisma.projectMilestone.findFirstOrThrow({ where: { id: milestoneId, projectId, workspaceId } });
    const action = typeof body.completed === 'boolean' ? (body.completed ? 'completed' : 'reopened') : 'updated';
    await this.recordActivity(workspaceId, actorId, 'MILESTONE', milestone.id, `${action} milestone “${milestone.title}”`);
    return milestone;
  }

  async listTasks(identity: AuthenticatedIdentity, workspaceId: string, label?: string) {
    await this.requireMembership(identity, workspaceId);
    const normalizedLabel = label?.trim().toLocaleLowerCase();
    if (normalizedLabel && (normalizedLabel.length > 32 || !/^[\p{L}\p{N}_-]+$/u.test(normalizedLabel))) throw new BadRequestException('Task label must be 1–32 letters, numbers, underscores, or hyphens.');
    return this.prisma.task.findMany({
      where: { workspaceId, ...(normalizedLabel ? { labels: { has: normalizedLabel } } : {}) },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, displayName: true } },
        events: { select: { id: true, title: true, startsAt: true } },
        dependsOn: { select: { id: true, title: true, status: true } },
        blocks: { select: { id: true, title: true, status: true } },
      },
    });
  }

  async listTaskLabels(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.requireMembership(identity, workspaceId);
    const tasks = await this.prisma.task.findMany({ where: { workspaceId }, select: { labels: true } });
    const counts = new Map<string, number>();
    for (const task of tasks) for (const label of task.labels) counts.set(label, (counts.get(label) ?? 0) + 1);
    return [...counts.entries()].map(([label, taskCount]) => ({ label, taskCount })).sort((a, b) => a.label.localeCompare(b.label));
  }

  async listTaskViews(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.requireMembership(identity, workspaceId);
    return this.prisma.workspaceTaskView.findMany({ where: { workspaceId }, orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }], include: { createdBy: { select: { id: true, displayName: true } } } });
  }

  async createTaskView(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const createdById = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const name = textField(body.name, 'View name', 60);
    const filters = taskViewFilters(body.filters);
    await this.validateTaskViewReferences(workspaceId, filters);
    if (await this.prisma.workspaceTaskView.findFirst({ where: { workspaceId, name: { equals: name, mode: 'insensitive' } }, select: { id: true } })) throw new BadRequestException('A task view already uses that name.');
    if (await this.prisma.workspaceTaskView.count({ where: { workspaceId } }) >= 20) throw new BadRequestException('A workspace can have up to 20 saved task views.');
    return this.prisma.workspaceTaskView.create({ data: { workspaceId, createdById, name, filters: filters as Prisma.InputJsonValue }, include: { createdBy: { select: { id: true, displayName: true } } } });
  }

  async updateTaskView(identity: AuthenticatedIdentity, workspaceId: string, viewId: string, input: unknown) {
    await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const data: { name?: string; filters?: Prisma.InputJsonValue } = {};
    if ('name' in body) data.name = textField(body.name, 'View name', 60);
    if ('filters' in body) {
      const filters = taskViewFilters(body.filters);
      await this.validateTaskViewReferences(workspaceId, filters);
      data.filters = filters as Prisma.InputJsonValue;
    }
    if (!Object.keys(data).length) throw new BadRequestException('Provide a new view name or filter set.');
    if (data.name && await this.prisma.workspaceTaskView.findFirst({ where: { workspaceId, id: { not: viewId }, name: { equals: data.name, mode: 'insensitive' } }, select: { id: true } })) throw new BadRequestException('A task view already uses that name.');
    const result = await this.prisma.workspaceTaskView.updateMany({ where: { id: viewId, workspaceId }, data });
    if (result.count !== 1) throw new NotFoundException('Saved task view not found in this workspace.');
    return this.prisma.workspaceTaskView.findFirstOrThrow({ where: { id: viewId, workspaceId }, include: { createdBy: { select: { id: true, displayName: true } } } });
  }

  async deleteTaskView(identity: AuthenticatedIdentity, workspaceId: string, viewId: string) {
    await this.requireMembership(identity, workspaceId, true);
    const result = await this.prisma.workspaceTaskView.deleteMany({ where: { id: viewId, workspaceId } });
    if (result.count !== 1) throw new NotFoundException('Saved task view not found in this workspace.');
    return { id: viewId, deleted: true };
  }

  private async validateTaskViewReferences(workspaceId: string, filters: TaskViewFilterSet) {
    if (filters.projectId && !await this.prisma.project.findFirst({ where: { id: filters.projectId, workspaceId }, select: { id: true } })) throw new BadRequestException('The selected project is not in this workspace.');
    if (filters.assigneeId && !['ALL', 'UNASSIGNED'].includes(filters.assigneeId) && !await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: filters.assigneeId } }, select: { userId: true } })) throw new BadRequestException('The selected assignee is not in this workspace.');
  }

  async renameTaskLabel(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const from = taskLabels([textField(body.from, 'Current label', 32)])[0];
    const to = taskLabels([textField(body.to, 'New label', 32)])[0];
    if (from === to) throw new BadRequestException('Choose a different label name.');
    return this.prisma.$transaction(async (transaction) => {
      const tasks = await transaction.task.findMany({ where: { workspaceId, labels: { has: from } }, select: { id: true, title: true, labels: true } });
      if (!tasks.length) throw new NotFoundException(`No tasks use the label “${from}”.`);
      let merged = 0;
      for (const task of tasks) {
        if (task.labels.includes(to)) merged += 1;
        const labels = taskLabels(task.labels.map((label) => label === from ? to : label));
        const result = await transaction.task.updateMany({ where: { id: task.id, workspaceId, labels: { equals: task.labels } }, data: { labels } });
        if (result.count !== 1) throw new BadRequestException('A task changed while the label was being renamed. Refresh and try again.');
        await this.createActivity(transaction, { workspaceId, actorId, entityType: 'TASK', entityId: task.id, message: `renamed the “${from}” label to “${to}” on “${task.title}”`, recipientScoped: true, additionalRecipientIds: [] });
      }
      return { from, to, updated: tasks.length, merged };
    });
  }

  async deleteTaskLabel(identity: AuthenticatedIdentity, workspaceId: string, rawLabel: string) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const label = taskLabels([rawLabel])[0];
    return this.prisma.$transaction(async (transaction) => {
      const tasks = await transaction.task.findMany({ where: { workspaceId, labels: { has: label } }, select: { id: true, title: true, labels: true } });
      if (!tasks.length) throw new NotFoundException(`No tasks use the label “${label}”.`);
      for (const task of tasks) {
        const labels = task.labels.filter((item) => item !== label);
        const result = await transaction.task.updateMany({ where: { id: task.id, workspaceId, labels: { equals: task.labels } }, data: { labels } });
        if (result.count !== 1) throw new BadRequestException('A task changed while the label was being removed. Refresh and try again.');
        await this.createActivity(transaction, { workspaceId, actorId, entityType: 'TASK', entityId: task.id, message: `removed the “${label}” label from “${task.title}”`, recipientScoped: true, additionalRecipientIds: [] });
      }
      return { label, updated: tasks.length, deleted: true };
    });
  }

  async bulkUpdateTasks(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    if (!Array.isArray(body.taskIds) || body.taskIds.length < 1 || body.taskIds.length > 500) throw new BadRequestException('Select between 1 and 500 tasks.');
    const taskIds = body.taskIds.map((value) => {
      const id = optionalUuid(value, 'Task');
      if (!id) throw new BadRequestException('Task IDs are required.');
      return id;
    });
    if (new Set(taskIds).size !== taskIds.length) throw new BadRequestException('A task can only be selected once.');
    const data: { priority?: TaskPriority; assigneeId?: string | null; status?: TaskStatus; dueAt?: Date | null; completedAt?: Date | null } = {};
    if ('priority' in body) data.priority = enumField(body.priority, taskPriorities, 'Task priority');
    if ('status' in body) {
      data.status = enumField(body.status, taskStatuses, 'Task status');
      data.completedAt = data.status === 'COMPLETED' ? new Date() : null;
    }
    if ('dueAt' in body) data.dueAt = dateField(body.dueAt, 'Task due date');
    if ('assigneeId' in body) {
      data.assigneeId = optionalUuid(body.assigneeId, 'Assignee');
      if (data.assigneeId && !await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: data.assigneeId } }, select: { userId: true } })) throw new BadRequestException('Assignee must be a member of this workspace.');
    }
    const labelFields = ['labels', 'addLabels', 'removeLabels'].filter((field) => field in body);
    if (labelFields.length > 1) throw new BadRequestException('Choose one label action: replace, add, or remove.');
    const replacementLabels = 'labels' in body ? taskLabels(body.labels) : null;
    const labelsToAdd = 'addLabels' in body ? taskLabels(body.addLabels) : null;
    const labelsToRemove = 'removeLabels' in body ? taskLabels(body.removeLabels) : null;
    if (!Object.keys(data).length && !labelFields.length) throw new BadRequestException('Choose a status, priority, assignee, due date, or labels change.');
    const changedStatuses: { id: string; status: string }[] = [];
    const updated = await this.prisma.$transaction(async (transaction) => {
      const previousTasks = await transaction.task.findMany({ where: { workspaceId, id: { in: taskIds } }, select: { id: true, title: true, status: true, priority: true, assigneeId: true, dueAt: true, labels: true } });
      if (previousTasks.length !== taskIds.length) throw new NotFoundException('One or more selected tasks are not in this workspace.');
      if (data.status === 'COMPLETED') {
        const completingIds = previousTasks.filter((task) => task.status !== 'COMPLETED').map((task) => task.id);
        const blocked = completingIds.length ? await transaction.task.findMany({ where: { workspaceId, id: { in: completingIds }, dependsOn: { some: { status: { not: 'COMPLETED' } } } }, select: { id: true, title: true, dependsOn: { where: { status: { not: 'COMPLETED' } }, select: { title: true } } } }) : [];
        if (blocked.length) throw new BadRequestException(`Complete prerequisite tasks first: ${blocked.map((task) => `${task.title} → ${task.dependsOn.map((prerequisite) => prerequisite.title).join(', ')}`).join('; ')}.`);
      }
      const updatedLabels = new Map<string, string[]>();
      for (const task of previousTasks) {
        const nextLabels = replacementLabels ?? (labelsToAdd ? taskLabels([...task.labels, ...labelsToAdd]) : labelsToRemove ? task.labels.filter((label) => !labelsToRemove.includes(label)) : task.labels);
        updatedLabels.set(task.id, nextLabels);
      }
      const changedTasks = previousTasks.filter((task) => ('priority' in data && task.priority !== data.priority) || ('status' in data && task.status !== data.status) || ('assigneeId' in data && task.assigneeId !== data.assigneeId) || ('dueAt' in data && (task.dueAt?.getTime() ?? null) !== (data.dueAt?.getTime() ?? null)) || (labelFields.length > 0 && JSON.stringify(task.labels) !== JSON.stringify(updatedLabels.get(task.id))));
      if (!changedTasks.length) return 0;
      if (labelFields.length) {
        for (const task of changedTasks) {
          const result = await transaction.task.updateMany({ where: { workspaceId, id: task.id }, data: { ...data, labels: updatedLabels.get(task.id)! } });
          if (result.count !== 1) throw new NotFoundException('One or more selected tasks are no longer available.');
        }
      } else {
        const result = await transaction.task.updateMany({ where: { workspaceId, id: { in: changedTasks.map((task) => task.id) } }, data });
        if (result.count !== changedTasks.length) throw new NotFoundException('One or more selected tasks are no longer available.');
      }
      for (const task of changedTasks) {
        if (data.status && task.status !== data.status) changedStatuses.push({ id: task.id, status: task.status });
        const assignmentRecipients = 'assigneeId' in data && task.assigneeId !== data.assigneeId ? [task.assigneeId, data.assigneeId].filter((id): id is string => Boolean(id)) : [];
        await this.createActivity(transaction, { workspaceId, actorId, entityType: 'TASK', entityId: task.id, message: `bulk updated task “${task.title}”`, recipientScoped: true, additionalRecipientIds: assignmentRecipients });
      }
      return changedTasks.length;
    });
    for (const change of changedStatuses) await this.automations.runForTaskStatusChange(workspaceId, change.id, change.status, data.status!, actorId);
    return { updated };
  }

  async bulkDuplicateTasks(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    if (!Array.isArray(body.taskIds) || body.taskIds.length < 1 || body.taskIds.length > 100) throw new BadRequestException('Select between 1 and 100 tasks to duplicate.');
    const taskIds = body.taskIds.map((value) => {
      const id = optionalUuid(value, 'Task');
      if (!id) throw new BadRequestException('Task IDs are required.');
      return id;
    });
    if (new Set(taskIds).size !== taskIds.length) throw new BadRequestException('A task can only be selected once.');
    const sources = await this.prisma.task.findMany({
      where: { workspaceId, id: { in: taskIds } },
      select: { id: true, projectId: true, title: true, description: true, priority: true, labels: true, dueAt: true, checklistItems: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { title: true, position: true } } },
    });
    if (sources.length !== taskIds.length) throw new NotFoundException('One or more selected tasks are not in this workspace.');
    const byId = new Map(sources.map((source) => [source.id, source]));
    const orderedSources = taskIds.map((id) => byId.get(id)!);

    return this.prisma.$transaction(async (transaction) => {
      const copies: { id: string; sourceId: string; title: string; checklistItemCount: number }[] = [];
      let checklistItemsCopied = 0;
      for (const source of orderedSources) {
        const title = `${source.title.slice(0, 194)} (copy)`;
        const duplicate = await transaction.task.create({ data: {
          workspaceId, projectId: source.projectId, createdById: actorId, title,
          description: source.description, status: 'TODO', priority: source.priority,
          labels: source.labels, dueAt: source.dueAt, completedAt: null,
        }, select: { id: true } });
        if (source.checklistItems.length) {
          await transaction.taskChecklistItem.createMany({ data: source.checklistItems.map((item) => ({ workspaceId, taskId: duplicate.id, createdById: actorId, title: item.title, position: item.position })) });
        }
        await this.createActivity(transaction, {
          workspaceId, actorId, entityType: 'TASK', entityId: duplicate.id,
          message: `duplicated task “${title.slice(0, 88)}” from “${source.title.slice(0, 88)}”`, recipientScoped: false, additionalRecipientIds: [],
        });
        copies.push({ id: duplicate.id, sourceId: source.id, title, checklistItemCount: source.checklistItems.length });
        checklistItemsCopied += source.checklistItems.length;
      }
      return { duplicated: copies.length, checklistItemsCopied, tasks: copies };
    });
  }

  async importTasks(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const mode = enumField(body.mode, ['CREATE', 'UPSERT'] as const, 'Import mode', 'CREATE');
    const projectId = optionalUuid(body.projectId, 'Project');
    if (projectId && !await this.prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })) throw new NotFoundException('Project not found in this workspace.');
    if (!Array.isArray(body.tasks) || body.tasks.length < 1 || body.tasks.length > 200) throw new BadRequestException('Import between 1 and 200 tasks at a time.');
    const rows = body.tasks.map((value) => {
      const row = objectInput(value);
      const status = enumField(row.status, taskStatuses, 'Task status', 'TODO');
      return {
        id: mode === 'UPSERT' ? optionalUuid(row.id, 'Task ID') : null,
        row,
        title: textField(row.title, 'Task title', 200),
        description: optionalText(row.description, 'Task description', 5000),
        status, priority: enumField(row.priority, taskPriorities, 'Task priority', 'MEDIUM'),
        dueAt: dateField(row.dueAt, 'Task due date'),
        labels: taskLabels(row.labels),
        projectId: 'projectId' in row ? optionalUuid(row.projectId, 'Task project') : projectId,
        assigneeId: 'assigneeId' in row ? optionalUuid(row.assigneeId, 'Task assignee') : null,
      };
    });
    const ids = rows.map((row) => row.id).filter((id): id is string => Boolean(id));
    if (new Set(ids).size !== ids.length) throw new BadRequestException('A task ID can appear only once in an import.');
    if (mode === 'UPSERT') {
      const updateFields = ['title', 'description', 'status', 'priority', 'dueAt', 'labels', 'projectId', 'assigneeId'];
      for (const task of rows.filter((row) => row.id)) if (updateFields.some((field) => !(field in task.row))) throw new BadRequestException('To update existing tasks, use a full AVEN task export with all columns.');
    }
    const projectIds = [...new Set(rows.map((row) => row.projectId).filter((id): id is string => Boolean(id)))];
    const assigneeIds = [...new Set(rows.map((row) => row.assigneeId).filter((id): id is string => Boolean(id)))];
    if (projectIds.length) {
      const projects = await this.prisma.project.findMany({ where: { workspaceId, id: { in: projectIds } }, select: { id: true } });
      if (projects.length !== projectIds.length) throw new BadRequestException('Every CSV project ID must belong to this workspace.');
    }
    if (assigneeIds.length) {
      const assignees = await this.prisma.workspaceMember.findMany({ where: { workspaceId, userId: { in: assigneeIds } }, select: { userId: true } });
      if (assignees.length !== assigneeIds.length) throw new BadRequestException('Every CSV assignee ID must belong to this workspace.');
    }
    const existingTasks = ids.length ? await this.prisma.task.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, title: true, description: true, status: true, priority: true, dueAt: true, labels: true, projectId: true, assigneeId: true, completedAt: true } }) : [];
    if (existingTasks.length !== ids.length) throw new NotFoundException('One or more task IDs are not in this workspace. Re-export current tasks before updating.');
    const existingById = new Map(existingTasks.map((task) => [task.id, task]));
    const updatedIds = rows.filter((row) => row.id && existingById.get(row.id)?.status !== 'COMPLETED' && row.status === 'COMPLETED').map((row) => row.id!);
    const blocked = updatedIds.length ? await this.prisma.task.findMany({
      where: { workspaceId, id: { in: updatedIds }, dependsOn: { some: { status: { not: 'COMPLETED' } } } },
      select: { title: true, dependsOn: { where: { status: { not: 'COMPLETED' } }, select: { title: true } } },
    }) : [];
    if (blocked.length) throw new BadRequestException(`Complete prerequisite tasks first: ${blocked.map((task) => `${task.title} → ${task.dependsOn.map((prerequisite) => prerequisite.title).join(', ')}`).join('; ')}.`);
    const statusChanges: { taskId: string; from: string; to: string }[] = [];
    const result = await this.prisma.$transaction(async (transaction) => {
      let created = 0;
      let updated = 0;
      for (const row of rows) {
        if (row.id) {
          const previous = existingById.get(row.id)!;
          const completedAt = row.status === 'COMPLETED' ? (previous.status === 'COMPLETED' ? previous.completedAt : new Date()) : null;
          const unchanged = previous.title === row.title && previous.description === row.description && previous.status === row.status && previous.priority === row.priority && (previous.dueAt?.getTime() ?? null) === (row.dueAt?.getTime() ?? null) && JSON.stringify(previous.labels) === JSON.stringify(row.labels) && previous.projectId === row.projectId && previous.assigneeId === row.assigneeId;
          if (unchanged) continue;
          const changed = await transaction.task.updateMany({ where: { workspaceId, id: row.id }, data: { title: row.title, description: row.description, status: row.status, priority: row.priority, dueAt: row.dueAt, labels: row.labels, projectId: row.projectId, assigneeId: row.assigneeId, completedAt } });
          if (changed.count !== 1) throw new NotFoundException('A task disappeared during import. No CSV changes were saved.');
          if (previous.status !== row.status) statusChanges.push({ taskId: row.id, from: previous.status, to: row.status });
          const recipients = previous.assigneeId !== row.assigneeId ? [previous.assigneeId, row.assigneeId].filter((id): id is string => Boolean(id)) : row.assigneeId ? [row.assigneeId] : [];
          await this.createActivity(transaction, { workspaceId, actorId, entityType: 'TASK', entityId: row.id, message: `updated task “${row.title}” from CSV import`, recipientScoped: true, additionalRecipientIds: recipients });
          updated += 1;
        } else {
          const task = await transaction.task.create({ data: { workspaceId, createdById: actorId, projectId: row.projectId, assigneeId: row.assigneeId, title: row.title, description: row.description, status: row.status, priority: row.priority, dueAt: row.dueAt, labels: row.labels, completedAt: row.status === 'COMPLETED' ? new Date() : null }, select: { id: true } });
          await this.createActivity(transaction, { workspaceId, actorId, entityType: 'TASK', entityId: task.id, message: `created task “${row.title}” from CSV import`, recipientScoped: true, additionalRecipientIds: row.assigneeId ? [row.assigneeId] : [] });
          created += 1;
        }
      }
      return { created, updated, unchanged: rows.filter((row) => row.id).length - updated };
    });
    for (const change of statusChanges) await this.automations.runForTaskStatusChange(workspaceId, change.taskId, change.from, change.to, actorId);
    return { ...result, projectId };
  }

  async createTask(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const projectId = optionalUuid(body.projectId, 'Project');
    const assigneeId = optionalUuid(body.assigneeId, 'Assignee');
    if (projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
      if (!project) throw new NotFoundException('Project not found in this workspace.');
    }
    if (assigneeId) {
      const member = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: assigneeId } }, select: { userId: true } });
      if (!member) throw new BadRequestException('Assignee must be a member of this workspace.');
    }
    const status = enumField(body.status, taskStatuses, 'Task status', 'TODO');
    const priority = enumField(body.priority, taskPriorities, 'Task priority', 'MEDIUM');
    const task = await this.prisma.task.create({
      data: {
        workspaceId,
        createdById: userId,
        projectId,
        assigneeId,
        title: textField(body.title, 'Task title', 200),
        description: optionalText(body.description, 'Task description', 5000),
        status,
        priority,
        dueAt: dateField(body.dueAt, 'Due date'),
        labels: taskLabels(body.labels),
        completedAt: status === 'COMPLETED' ? new Date() : null,
      },
      include: { project: { select: { id: true, name: true } }, assignee: { select: { id: true, displayName: true } } },
    });
    await this.recordActivity(workspaceId, userId, 'TASK', task.id, `created task “${task.title}”`, Boolean(task.assigneeId), task.assigneeId ? [task.assigneeId] : []);
    return task;
  }

  async duplicateTask(identity: AuthenticatedIdentity, workspaceId: string, taskId: string) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const source = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      select: {
        id: true, projectId: true, title: true, description: true, priority: true, labels: true, dueAt: true,
        checklistItems: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { title: true, position: true } },
      },
    });
    if (!source) throw new NotFoundException('Task not found in this workspace.');
    const title = `${source.title.slice(0, 194)} (copy)`;

    return this.prisma.$transaction(async (transaction) => {
      const duplicate = await transaction.task.create({
        data: {
          workspaceId, projectId: source.projectId, createdById: actorId, title,
          description: source.description, status: 'TODO', priority: source.priority,
          labels: source.labels, dueAt: source.dueAt, completedAt: null,
        },
        include: { project: { select: { id: true, name: true } }, assignee: { select: { id: true, displayName: true } } },
      });
      if (source.checklistItems.length) {
        await transaction.taskChecklistItem.createMany({
          data: source.checklistItems.map((item) => ({ workspaceId, taskId: duplicate.id, createdById: actorId, title: item.title, position: item.position })),
        });
      }
      await this.createActivity(transaction, {
        workspaceId, actorId, entityType: 'TASK', entityId: duplicate.id,
        message: `duplicated task “${title.slice(0, 88)}” from “${source.title.slice(0, 88)}”`, recipientScoped: false, additionalRecipientIds: [],
      });
      return { ...duplicate, duplicatedFromTaskId: source.id, checklistItemCount: source.checklistItems.length };
    });
  }

  async updateTask(identity: AuthenticatedIdentity, workspaceId: string, taskId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const previousTask = await this.prisma.task.findFirst({ where: { id: taskId, workspaceId }, select: { status: true, assigneeId: true } });
    if (!previousTask) throw new NotFoundException('Task not found in this workspace.');
    const data: {
      title?: string;
      description?: string | null;
      status?: TaskStatus;
      priority?: TaskPriority;
      dueAt?: Date | null;
      completedAt?: Date | null;
      assigneeId?: string | null;
      labels?: string[];
    } = {};

    if ('title' in body) data.title = textField(body.title, 'Task title', 200);
    if ('description' in body) data.description = optionalText(body.description, 'Task description', 5000);
    if ('status' in body) {
      data.status = enumField(body.status, taskStatuses, 'Task status');
      if (data.status === 'COMPLETED') {
        const blockers = await this.prisma.task.findFirst({
          where: { id: taskId, workspaceId },
          select: { dependsOn: { where: { status: { not: 'COMPLETED' } }, select: { title: true } } },
        });
        if (!blockers) throw new NotFoundException('Task not found in this workspace.');
        if (blockers.dependsOn.length) throw new BadRequestException(`Complete prerequisite tasks first: ${blockers.dependsOn.map((task) => task.title).join(', ')}.`);
      }
      data.completedAt = data.status === 'COMPLETED' ? new Date() : null;
    }
    if ('priority' in body) data.priority = enumField(body.priority, taskPriorities, 'Task priority');
    if ('labels' in body) data.labels = taskLabels(body.labels);
    if ('dueAt' in body) data.dueAt = dateField(body.dueAt, 'Due date');
    if ('assigneeId' in body) {
      const assigneeId = optionalUuid(body.assigneeId, 'Assignee');
      if (assigneeId) {
        const member = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: assigneeId } }, select: { userId: true } });
        if (!member) throw new BadRequestException('Assignee must be a member of this workspace.');
      }
      data.assigneeId = assigneeId;
    }
    if (!Object.keys(data).length) throw new BadRequestException('Provide at least one task field to update.');

    const result = await this.prisma.task.updateMany({ where: { id: taskId, workspaceId }, data });
    if (result.count !== 1) throw new NotFoundException('Task not found in this workspace.');
    if (data.status && data.status !== previousTask.status) {
      await this.automations.runForTaskStatusChange(workspaceId, taskId, previousTask.status, data.status, actorId);
    }
    const task = await this.prisma.task.findFirstOrThrow({
      where: { id: taskId, workspaceId },
      include: { project: { select: { id: true, name: true } }, assignee: { select: { id: true, displayName: true } } },
    });
    const assigneeChanged = 'assigneeId' in data && previousTask.assigneeId !== (task.assignee?.id ?? null);
    const assignmentRecipients = assigneeChanged
      ? [previousTask.assigneeId, task.assignee?.id].filter((id): id is string => Boolean(id))
      : [];
    await this.recordActivity(workspaceId, actorId, 'TASK', task.id, `updated task “${task.title}”`, true, assignmentRecipients);
    return task;
  }

  async setTaskDependencies(identity: AuthenticatedIdentity, workspaceId: string, taskId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    if (!Array.isArray(body.dependsOnTaskIds) || body.dependsOnTaskIds.length > 100) {
      throw new BadRequestException('dependsOnTaskIds must be an array of up to 100 task IDs.');
    }
    const ids = body.dependsOnTaskIds.map((value) => {
      const id = optionalUuid(value, 'Prerequisite task');
      if (!id) throw new BadRequestException('Prerequisite task ID is required.');
      return id;
    });
    if (new Set(ids).size !== ids.length) throw new BadRequestException('A prerequisite task can only be selected once.');
    const target = await this.prisma.task.findFirst({ where: { id: taskId, workspaceId }, select: { id: true, projectId: true, status: true } });
    if (!target) throw new NotFoundException('Task not found in this workspace.');
    if (ids.includes(taskId)) throw new BadRequestException('A task cannot depend on itself.');
    const candidates = await this.prisma.task.findMany({
      where: { workspaceId, projectId: target.projectId },
      select: { id: true, dependsOn: { select: { id: true } } },
    });
    const candidateIds = new Set(candidates.map((task) => task.id));
    if (ids.some((id) => !candidateIds.has(id))) throw new BadRequestException('Prerequisites must be tasks in the same project.');
    if (target.status === 'COMPLETED' && ids.length) throw new BadRequestException('Reopen this task before adding prerequisites.');
    const graph = new Map(candidates.map((task) => [task.id, task.id === taskId ? ids : task.dependsOn.map((dependency) => dependency.id)]));
    const reachesTarget = (current: string, visited = new Set<string>()): boolean => {
      if (current === taskId) return true;
      if (visited.has(current)) return false;
      visited.add(current);
      return (graph.get(current) ?? []).some((dependency) => reachesTarget(dependency, visited));
    };
    if (ids.some((id) => reachesTarget(id))) throw new BadRequestException('This dependency would create a task cycle.');
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: { dependsOn: { set: ids.map((id) => ({ id })) } },
      include: { dependsOn: { select: { id: true, title: true, status: true } }, blocks: { select: { id: true, title: true, status: true } } },
    });
    await this.recordActivity(workspaceId, actorId, 'TASK', task.id, `updated dependencies for task “${task.title}”`, true);
    return task;
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
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const projectId = optionalUuid(body.projectId, 'Project');
    if (projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
      if (!project) throw new NotFoundException('Project not found in this workspace.');
    }
    const document = await this.prisma.document.create({
      data: {
        workspaceId,
        projectId,
        title: textField(body.title, 'Document title', 200),
        content: typeof body.content === 'string' && body.content.length <= 100000 ? body.content : invalidText('Document content must be 100,000 characters or fewer.'),
      },
      include: { project: { select: { id: true, name: true } } },
    });
    await this.recordActivity(workspaceId, actorId, 'DOCUMENT', document.id, `created document “${document.title}”`);
    return document;
  }

  async updateDocument(identity: AuthenticatedIdentity, workspaceId: string, documentId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const data: { title?: string; content?: string } = {};
    if ('title' in body) data.title = textField(body.title, 'Document title', 200);
    if ('content' in body) {
      if (typeof body.content !== 'string' || body.content.length > 100000) {
        throw new BadRequestException('Document content must be 100,000 characters or fewer.');
      }
      data.content = body.content;
    }
    if ('silent' in body && typeof body.silent !== 'boolean') throw new BadRequestException('silent must be a boolean.');
    if (!Object.keys(data).length) throw new BadRequestException('Provide a title or content to update.');
    const result = await this.prisma.document.updateMany({ where: { id: documentId, workspaceId }, data });
    if (result.count !== 1) throw new NotFoundException('Document not found in this workspace.');
    const document = await this.prisma.document.findFirstOrThrow({
      where: { id: documentId, workspaceId },
      include: { project: { select: { id: true, name: true } } },
    });
    if (body.silent !== true) await this.recordActivity(workspaceId, actorId, 'DOCUMENT', document.id, `updated document “${document.title}”`);
    return document;
  }

  async getDocument(identity: AuthenticatedIdentity, workspaceId: string, documentId: string) {
    await this.requireMembership(identity, workspaceId);
    const document = await this.prisma.document.findFirst({ where: { id: documentId, workspaceId }, include: { project: { select: { id: true, name: true } } } });
    if (!document) throw new NotFoundException('Document not found in this workspace.');
    return document;
  }

  async listDocumentVersions(identity: AuthenticatedIdentity, workspaceId: string, documentId: string) {
    await this.requireMembership(identity, workspaceId);
    await this.requireDocument(workspaceId, documentId);
    return this.prisma.documentVersion.findMany({
      where: { workspaceId, documentId }, orderBy: { createdAt: 'desc' }, take: 50,
      select: { id: true, title: true, label: true, createdAt: true, createdBy: { select: { displayName: true } } },
    });
  }

  async createDocumentVersion(identity: AuthenticatedIdentity, workspaceId: string, documentId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const label = optionalText(body.label, 'Version label', 120);
    const document = await this.requireDocument(workspaceId, documentId);
    const version = await this.prisma.documentVersion.create({
      data: { workspaceId, documentId, createdById: actorId, title: document.title, content: document.content, label },
      select: { id: true, title: true, label: true, createdAt: true, createdBy: { select: { displayName: true } } },
    });
    await this.recordActivity(workspaceId, actorId, 'DOCUMENT', documentId, `saved version of “${document.title}”`);
    return version;
  }

  async restoreDocumentVersion(identity: AuthenticatedIdentity, workspaceId: string, documentId: string, versionId: string) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const [document, version] = await Promise.all([
      this.requireDocument(workspaceId, documentId),
      this.prisma.documentVersion.findFirst({ where: { id: versionId, workspaceId, documentId } }),
    ]);
    if (!version) throw new NotFoundException('Version not found for this document.');
    const restored = await this.prisma.$transaction(async (transaction) => {
      await transaction.documentVersion.create({ data: { workspaceId, documentId, createdById: actorId, title: document.title, content: document.content, label: 'Before restore' } });
      return transaction.document.update({ where: { id: documentId }, data: { title: version.title, content: version.content }, include: { project: { select: { id: true, name: true } } } });
    });
    await this.recordActivity(workspaceId, actorId, 'DOCUMENT', documentId, `restored a version of “${restored.title}”`);
    return restored;
  }

  async listDocumentComments(identity: AuthenticatedIdentity, workspaceId: string, documentId: string) {
    await this.requireMembership(identity, workspaceId);
    await this.requireDocument(workspaceId, documentId);
    return this.prisma.documentComment.findMany({
      where: { workspaceId, documentId }, orderBy: [{ resolvedAt: 'asc' }, { createdAt: 'desc' }],
      include: { createdBy: { select: { id: true, displayName: true } } },
    });
  }

  async createDocumentComment(identity: AuthenticatedIdentity, workspaceId: string, documentId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const message = textField(body.body, 'Comment', 2000);
    const document = await this.requireDocument(workspaceId, documentId);
    const comment = await this.prisma.documentComment.create({ data: { workspaceId, documentId, createdById: actorId, body: message }, include: { createdBy: { select: { id: true, displayName: true } } } });
    await this.recordActivity(workspaceId, actorId, 'DOCUMENT', documentId, `commented on “${document.title}”`);
    return comment;
  }

  async resolveDocumentComment(identity: AuthenticatedIdentity, workspaceId: string, documentId: string, commentId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    if (typeof body.resolved !== 'boolean') throw new BadRequestException('resolved must be a boolean.');
    const result = await this.prisma.documentComment.updateMany({
      where: { id: commentId, documentId, workspaceId },
      data: { resolvedAt: body.resolved ? new Date() : null },
    });
    if (result.count !== 1) throw new NotFoundException('Comment not found for this document.');
    const comment = await this.prisma.documentComment.findFirstOrThrow({ where: { id: commentId, documentId, workspaceId }, include: { createdBy: { select: { id: true, displayName: true } } } });
    await this.recordActivity(workspaceId, actorId, 'DOCUMENT', documentId, `${body.resolved ? 'resolved' : 'reopened'} a comment on “${comment.body.slice(0, 60)}”`);
    return comment;
  }

  private async requireDocument(workspaceId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, workspaceId } });
    if (!document) throw new NotFoundException('Document not found in this workspace.');
    return document;
  }

  async listCalendarEvents(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.requireMembership(identity, workspaceId);
    return this.prisma.calendarEvent.findMany({
      where: { workspaceId },
      orderBy: { startsAt: 'asc' },
      include: { task: { select: { id: true, title: true } }, project: { select: { id: true, name: true } } },
    });
  }

  async searchWorkspace(identity: AuthenticatedIdentity, workspaceId: string, rawQuery: unknown) {
    await this.requireMembership(identity, workspaceId);
    if (typeof rawQuery !== 'string' || rawQuery.trim().length < 2 || rawQuery.trim().length > 100) {
      throw new BadRequestException('Search must be between 2 and 100 characters.');
    }
    const query = rawQuery.trim();
    const contains = { contains: query, mode: 'insensitive' as const };
    const [projects, tasks, documents, databases, records, knowledge, events] = await Promise.all([
      this.prisma.project.findMany({ where: { workspaceId, OR: [{ name: contains }, { description: contains }] }, orderBy: { updatedAt: 'desc' }, take: 12, select: { id: true, name: true, description: true, updatedAt: true } }),
      this.prisma.task.findMany({ where: { workspaceId, OR: [{ title: contains }, { description: contains }, { labels: { has: query.toLocaleLowerCase() } }] }, orderBy: { updatedAt: 'desc' }, take: 12, select: { id: true, title: true, description: true, labels: true, updatedAt: true, project: { select: { name: true } } } }),
      this.prisma.document.findMany({ where: { workspaceId, OR: [{ title: contains }, { content: contains }] }, orderBy: { updatedAt: 'desc' }, take: 12, select: { id: true, title: true, content: true, updatedAt: true } }),
      this.prisma.workspaceDatabase.findMany({ where: { workspaceId, OR: [{ name: contains }, { description: contains }] }, orderBy: { updatedAt: 'desc' }, take: 8, select: { id: true, name: true, description: true, updatedAt: true } }),
      this.prisma.databaseRecord.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, take: 300, select: { id: true, values: true, updatedAt: true, database: { select: { id: true, name: true } } } }),
      this.prisma.knowledgeItem.findMany({ where: { workspaceId, archivedAt: null, OR: [{ title: contains }, { content: contains }, { tags: { has: query.toLocaleLowerCase() } }] }, orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }], take: 12, select: { id: true, title: true, content: true, tags: true, updatedAt: true } }),
      this.prisma.calendarEvent.findMany({ where: { workspaceId, OR: [{ title: contains }, { description: contains }, { location: contains }] }, orderBy: { updatedAt: 'desc' }, take: 12, select: { id: true, title: true, description: true, location: true, startsAt: true, updatedAt: true } }),
    ]);
    const needle = query.toLocaleLowerCase();
    const results = [
      ...projects.map((item) => ({ id: item.id, type: 'Project', title: item.name, detail: item.description ?? 'Project', href: '/workspace/projects', updatedAt: item.updatedAt })),
      ...tasks.map((item) => ({ id: item.id, type: 'Task', title: item.title, detail: [...(item.project?.name ? [item.project.name] : []), ...(item.labels.length ? [item.labels.map((label) => `#${label}`).join(' ')] : []), ...(item.description ? [item.description] : [])].join(' · ') || 'Workspace task', labels: item.labels, href: `/workspace/tasks/${item.id}`, updatedAt: item.updatedAt })),
      ...documents.map((item) => {
        const content = documentPlainText(item.content);
        return { id: item.id, type: 'Document', title: item.title, detail: content.toLocaleLowerCase().includes(needle) ? excerpt(content, needle) : 'Workspace document', href: `/workspace/documents/${item.id}`, updatedAt: item.updatedAt };
      }),
      ...databases.map((item) => ({ id: item.id, type: 'Database', title: item.name, detail: item.description ?? 'Workspace database', href: '/workspace/databases', updatedAt: item.updatedAt })),
      ...records.filter((item) => JSON.stringify(item.values).toLocaleLowerCase().includes(needle)).slice(0, 12).map((item) => ({ id: item.id, type: 'Record', title: recordTitle(item.values), detail: item.database.name, href: '/workspace/databases', updatedAt: item.updatedAt })),
      ...knowledge.map((item) => ({ id: item.id, type: 'Knowledge', title: item.title, detail: item.content.toLocaleLowerCase().includes(needle) ? excerpt(item.content, needle) : item.tags.join(' · ') || 'Workspace reference', href: '/workspace/knowledge', updatedAt: item.updatedAt })),
      ...events.map((item) => ({ id: item.id, type: 'Event', title: item.title, detail: item.description ?? item.location ?? `Scheduled ${item.startsAt.toLocaleString()}`, href: '/workspace/calendar', updatedAt: item.updatedAt })),
    ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 40);
    return { query, results };
  }

  async createCalendarEvent(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const taskId = optionalUuid(body.taskId, 'Task');
    const projectId = optionalUuid(body.projectId, 'Project');
    if (taskId) {
      const task = await this.prisma.task.findFirst({ where: { id: taskId, workspaceId }, select: { id: true, title: true } });
      if (!task) throw new NotFoundException('Task not found in this workspace.');
    }
    if (projectId && !await this.prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })) throw new NotFoundException('Project not found in this workspace.');
    const startsAt = requiredDate(body.startsAt, 'Start time');
    const endsAt = dateField(body.endsAt, 'End time');
    if (endsAt && endsAt <= startsAt) throw new BadRequestException('End time must be after the start time.');
    const recurrence = recurrenceField(body.recurrence);
    const recurrenceInterval = recurrenceIntervalField(body.recurrenceInterval);
    const recurrenceUntil = dateField(body.recurrenceUntil, 'Repeat until');
    const recurrenceTimeZone = recurrence ? timeZoneField(body.recurrenceTimeZone) : null;
    if ('isAllDay' in body && typeof body.isAllDay !== 'boolean') throw new BadRequestException('All-day must be a boolean.');
    validateRecurrence(recurrence ?? null, recurrenceUntil ?? null, startsAt, recurrenceTimeZone);
    const event = await this.prisma.calendarEvent.create({
      data: {
        workspaceId,
        taskId,
        projectId,
        title: textField(body.title, 'Event title', 200),
        description: optionalText(body.description, 'Event notes', 2000),
        location: optionalText(body.location, 'Location', 250),
        type: enumField(body.type, calendarEventTypes, 'Event type', 'MEETING'),
        isAllDay: body.isAllDay === true,
        startsAt,
        endsAt,
        recurrence,
        recurrenceInterval,
        recurrenceUntil,
        recurrenceTimeZone,
      },
      include: { task: { select: { id: true, title: true } }, project: { select: { id: true, name: true } } },
    });
    await this.recordActivity(workspaceId, actorId, 'CALENDAR', event.id, `${recurrence ? 'scheduled a recurring series' : 'scheduled'} “${event.title}”`);
    return event;
  }

  async updateCalendarEvent(identity: AuthenticatedIdentity, workspaceId: string, eventId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const body = objectInput(input);
    const existing = await this.prisma.calendarEvent.findFirst({ where: { id: eventId, workspaceId }, select: { id: true, title: true, startsAt: true, endsAt: true, recurrence: true, recurrenceInterval: true, recurrenceUntil: true, recurrenceTimeZone: true } });
    if (!existing) throw new NotFoundException('Calendar event not found in this workspace.');
    const data: { title?: string; startsAt?: Date; endsAt?: Date | null; taskId?: string | null; projectId?: string | null; description?: string | null; location?: string | null; type?: typeof calendarEventTypes[number]; isAllDay?: boolean; recurrence?: typeof calendarRecurrences[number] | null; recurrenceInterval?: number; recurrenceUntil?: Date | null; recurrenceTimeZone?: string | null } = {};
    if ('title' in body) data.title = textField(body.title, 'Event title', 200);
    if ('description' in body) data.description = optionalText(body.description, 'Event notes', 2000);
    if ('location' in body) data.location = optionalText(body.location, 'Location', 250);
    if ('type' in body) data.type = enumField(body.type, calendarEventTypes, 'Event type');
    if ('isAllDay' in body) {
      if (typeof body.isAllDay !== 'boolean') throw new BadRequestException('All-day must be a boolean.');
      data.isAllDay = body.isAllDay;
    }
    if ('startsAt' in body) data.startsAt = requiredDate(body.startsAt, 'Start time');
    if ('endsAt' in body) data.endsAt = dateField(body.endsAt, 'End time');
    if ('recurrence' in body) data.recurrence = recurrenceField(body.recurrence);
    if ('recurrenceInterval' in body) data.recurrenceInterval = recurrenceIntervalField(body.recurrenceInterval);
    if ('recurrenceUntil' in body) data.recurrenceUntil = dateField(body.recurrenceUntil, 'Repeat until');
    if ('recurrenceTimeZone' in body) data.recurrenceTimeZone = timeZoneField(body.recurrenceTimeZone);
    if ('recurrence' in body && !body.recurrence) { data.recurrenceInterval = 1; data.recurrenceUntil = null; data.recurrenceTimeZone = null; }
    if ('taskId' in body) {
      data.taskId = optionalUuid(body.taskId, 'Task');
      if (data.taskId && !await this.prisma.task.findFirst({ where: { id: data.taskId, workspaceId }, select: { id: true } })) throw new NotFoundException('Task not found in this workspace.');
    }
    if ('projectId' in body) {
      data.projectId = optionalUuid(body.projectId, 'Project');
      if (data.projectId && !await this.prisma.project.findFirst({ where: { id: data.projectId, workspaceId }, select: { id: true } })) throw new NotFoundException('Project not found in this workspace.');
    }
    const startsAt = data.startsAt ?? existing.startsAt;
    const endsAt = 'endsAt' in data ? data.endsAt : existing.endsAt;
    if (endsAt && endsAt <= startsAt) throw new BadRequestException('End time must be after the start time.');
    const recurrence = 'recurrence' in data ? data.recurrence : existing.recurrence;
    const recurrenceUntil = 'recurrenceUntil' in data ? data.recurrenceUntil : existing.recurrenceUntil;
    const recurrenceTimeZone = 'recurrenceTimeZone' in data ? data.recurrenceTimeZone : existing.recurrenceTimeZone;
    validateRecurrence(recurrence ?? null, recurrenceUntil ?? null, startsAt, recurrenceTimeZone ?? null);
    const updated = await this.prisma.calendarEvent.update({ where: { id: eventId }, data, include: { task: { select: { id: true, title: true } }, project: { select: { id: true, name: true } } } });
    await this.recordActivity(workspaceId, actorId, 'CALENDAR', eventId, `updated ${updated.recurrence ? 'recurring series' : 'event'} “${updated.title}”`);
    return updated;
  }

  async deleteCalendarEvent(identity: AuthenticatedIdentity, workspaceId: string, eventId: string) {
    const actorId = await this.requireMembership(identity, workspaceId, true);
    const event = await this.prisma.calendarEvent.findFirst({ where: { id: eventId, workspaceId }, select: { id: true, title: true, recurrence: true } });
    if (!event) throw new NotFoundException('Calendar event not found in this workspace.');
    await this.prisma.$transaction([
      this.prisma.workspaceActivity.create({ data: { workspaceId, actorId, entityType: 'CALENDAR', entityId: eventId, message: `removed ${event.recurrence ? 'recurring series' : 'event'} “${event.title}” from calendar` } }),
      this.prisma.calendarEvent.delete({ where: { id: eventId } }),
    ]);
    return { id: eventId, deleted: true };
  }

  private recordActivity(workspaceId: string, actorId: string, entityType: string, entityId: string, message: string, recipientScoped = false, additionalRecipientIds: string[] = []) {
    return this.prisma.$transaction((transaction) => this.createActivity(transaction, { workspaceId, actorId, entityType, entityId, message, recipientScoped, additionalRecipientIds }));
  }

  private async createActivity(transaction: Prisma.TransactionClient, input: { workspaceId: string; actorId: string; entityType: string; entityId: string; message: string; recipientScoped: boolean; additionalRecipientIds: string[] }) {
    const activity = await transaction.workspaceActivity.create({ data: { workspaceId: input.workspaceId, actorId: input.actorId, entityType: input.entityType, entityId: input.entityId, message: input.message, recipientScoped: input.recipientScoped } });
    const followerIds = input.recipientScoped && input.entityType === 'TASK'
      ? (await transaction.taskFollower.findMany({ where: { workspaceId: input.workspaceId, taskId: input.entityId }, select: { userId: true } })).map(({ userId }) => userId)
      : [];
    const recipientIds = [...new Set([...followerIds, ...input.additionalRecipientIds])].filter((userId) => userId !== input.actorId);
    if (recipientIds.length) await transaction.activityReceipt.createMany({ data: recipientIds.map((userId) => ({ activityId: activity.id, userId, isNotificationTarget: true })), skipDuplicates: true });
    return activity;
  }

  private async requireMembership(identity: AuthenticatedIdentity, workspaceId: string, write = false) {
    const user = await this.prisma.user.findUnique({
      where: { identityIssuer_identitySubject: { identityIssuer: identity.issuer, identitySubject: identity.subject } },
      select: { id: true },
    });
    if (!user) throw new ForbiddenException('Your AVEN account is not connected to a workspace yet.');
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      select: { userId: true, role: true },
    });
    if (!membership) throw new NotFoundException('Workspace not found.');
    if (write && membership.role === 'GUEST') throw new ForbiddenException('Guest members have read-only access to this workspace.');
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

function moneyCentsField(value: unknown, label: string, nullable: boolean) {
  if ((value === undefined || value === null || value === '') && nullable) return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw new BadRequestException(`${label} must be a non-negative amount.`);
  const amount = String(value).trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount)) throw new BadRequestException(`${label} must be a non-negative amount with up to two decimals.`);
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(cents)) throw new BadRequestException(`${label} is too large.`);
  return cents;
}

function requiredDate(value: unknown, label: string) {
  const date = dateField(value, label);
  if (!date) throw new BadRequestException(`${label} is required.`);
  return date;
}

function recurrenceField(value: unknown): typeof calendarRecurrences[number] | null {
  if (value === undefined || value === null || value === '') return null;
  return enumField(value, calendarRecurrences, 'Repeat frequency');
}

function recurrenceIntervalField(value: unknown) {
  if (value === undefined) return 1;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 12) throw new BadRequestException('Repeat interval must be a whole number from 1 to 12.');
  return value;
}

function timeZoneField(value: unknown) {
  if (typeof value !== 'string' || value.length > 80) throw new BadRequestException('Choose a valid timezone for this recurring series.');
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date()); }
  catch { throw new BadRequestException('Choose a valid timezone for this recurring series.'); }
  return value;
}

function validateRecurrence(recurrence: string | null, until: Date | null, startsAt: Date, timeZone: string | null) {
  if (!recurrence && until) throw new BadRequestException('Choose a repeat frequency before setting an end date.');
  if (recurrence && !until) throw new BadRequestException('Choose the final date for this recurring series.');
  if (recurrence && !timeZone) throw new BadRequestException('A timezone is required for recurring events.');
  if (recurrence && until && until <= startsAt) throw new BadRequestException('The repeat end date must be after the first occurrence.');
  const maximumUntil = new Date(startsAt);
  maximumUntil.setFullYear(maximumUntil.getFullYear() + 2);
  if (until && until > maximumUntil) throw new BadRequestException('Recurring events can span up to two years.');
}

function invalidText(message: string): never {
  throw new BadRequestException(message);
}

function documentPlainText(value: string) {
  try {
    const parsed = JSON.parse(value) as { format?: string; blocks?: { text?: string }[] };
    if (parsed.format === 'aven-doc-v1' && Array.isArray(parsed.blocks)) return parsed.blocks.map((block) => block.text ?? '').filter(Boolean).join(' ');
  } catch { /* Older documents store plain text. */ }
  return value;
}

function excerpt(content: string, needle: string) {
  const index = content.toLocaleLowerCase().indexOf(needle);
  if (index < 0) return content.slice(0, 140);
  const start = Math.max(0, index - 45);
  return `${start > 0 ? '…' : ''}${content.slice(start, start + 140).trim()}${start + 140 < content.length ? '…' : ''}`;
}

function recordTitle(values: unknown) {
  if (values && typeof values === 'object' && !Array.isArray(values)) {
    const name = (values as Record<string, unknown>).name;
    if (typeof name === 'string' && name.trim()) return name;
    const first = Object.values(values as Record<string, unknown>).find((value) => typeof value === 'string' && value.trim());
    if (typeof first === 'string') return first;
  }
  return 'Untitled record';
}

type ProjectTaskTemplate = { title: string; description: string | null; priority: TaskPriority; labels: string[]; daysFromToday: number | null; dependsOnIndexes: number[] };
type ProjectMilestoneTemplate = { title: string; daysFromToday: number | null };

function taskLabels(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 10 || value.some((label) => typeof label !== 'string')) throw new BadRequestException('Tasks can have up to 10 text labels.');
  const labels = value.map((label) => (label as string).trim().toLocaleLowerCase()).filter(Boolean);
  if (labels.some((label) => label.length > 32 || !/^[\p{L}\p{N}_-]+$/u.test(label))) throw new BadRequestException('Each task label must be 1–32 letters, numbers, underscores, or hyphens.');
  return [...new Set(labels)];
}

function taskViewFilters(value: unknown): TaskViewFilterSet {
  const input = objectInput(value);
  if (typeof input.search !== 'string' || input.search.length > 300) throw new BadRequestException('Task view search must be 300 characters or fewer.');
  const projectId = optionalUuid(input.projectId, 'Project filter') ?? '';
  let assigneeId = 'ALL';
  if (input.assigneeId === 'UNASSIGNED') assigneeId = 'UNASSIGNED';
  else if (input.assigneeId !== undefined && input.assigneeId !== null && input.assigneeId !== '' && input.assigneeId !== 'ALL') assigneeId = optionalUuid(input.assigneeId, 'Assignee filter') ?? 'ALL';
  const label = typeof input.label === 'string' && input.label.trim() ? taskLabels([input.label])[0] : '';
  return {
    projectId,
    search: input.search.trim(),
    status: enumField(input.status, taskViewStatuses, 'Task view status', 'ALL'),
    priority: enumField(input.priority, taskViewPriorities, 'Task view priority', 'ALL'),
    assigneeId,
    label,
    due: enumField(input.due, taskViewDueFilters, 'Task view due date filter', 'ALL'),
    dependency: enumField(input.dependency, taskViewDependencyFilters, 'Task view dependency filter', 'ALL'),
    sort: enumField(input.sort, taskViewSorts, 'Task view sort order', 'DUE_ASC'),
  };
}

function parseTemplateTasks(value: Prisma.JsonValue): ProjectTaskTemplate[] {
  if (!Array.isArray(value) || value.length > 100) throw new BadRequestException('This project template has invalid task data.');
  const tasks = value.map((entry) => {
    if (!entry || Array.isArray(entry) || typeof entry !== 'object') throw new BadRequestException('This project template has invalid task data.');
    const task = entry as Record<string, Prisma.JsonValue>;
    if (typeof task.title !== 'string' || !task.title.trim() || task.title.length > 200 || (task.description !== null && task.description !== undefined && (typeof task.description !== 'string' || task.description.length > 5000)) || typeof task.priority !== 'string' || !taskPriorities.includes(task.priority as TaskPriority)) throw new BadRequestException('This project template has invalid task data.');
    const dependencies = task.dependsOnIndexes ?? [];
    if (!Array.isArray(dependencies) || dependencies.length > 100 || dependencies.some((index) => typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= value.length)) throw new BadRequestException('This project template has invalid prerequisite links.');
    const dependsOnIndexes = dependencies as number[];
    if (new Set(dependsOnIndexes).size !== dependsOnIndexes.length) throw new BadRequestException('This project template repeats a task prerequisite.');
    const daysFromToday = task.daysFromToday ?? null;
    if (daysFromToday !== null && (typeof daysFromToday !== 'number' || !Number.isInteger(daysFromToday) || daysFromToday < -3650 || daysFromToday > 3650)) throw new BadRequestException('This project template has an invalid task date offset.');
    return { title: task.title.trim(), description: typeof task.description === 'string' && task.description.trim() ? task.description.trim() : null, priority: task.priority as TaskPriority, labels: taskLabels(task.labels ?? []), daysFromToday: daysFromToday as number | null, dependsOnIndexes };
  });
  for (const [index, task] of tasks.entries()) if (task.dependsOnIndexes.includes(index)) throw new BadRequestException('A project template task cannot depend on itself.');
  const reaches = (from: number, target: number, visited = new Set<number>()): boolean => {
    if (from === target) return true;
    if (visited.has(from)) return false;
    visited.add(from);
    return (tasks[from]?.dependsOnIndexes ?? []).some((dependency) => reaches(dependency, target, visited));
  };
  for (const [index, task] of tasks.entries()) if (task.dependsOnIndexes.some((dependency) => reaches(dependency, index))) throw new BadRequestException('This project template contains a prerequisite cycle.');
  return tasks;
}

function parseTemplateMilestones(value: Prisma.JsonValue): ProjectMilestoneTemplate[] {
  if (!Array.isArray(value) || value.length > 50) throw new BadRequestException('This project template has invalid milestone data.');
  return value.map((entry) => {
    if (!entry || Array.isArray(entry) || typeof entry !== 'object') throw new BadRequestException('This project template has invalid milestone data.');
    const milestone = entry as Record<string, Prisma.JsonValue>;
    if (typeof milestone.title !== 'string' || !milestone.title.trim() || milestone.title.length > 160) throw new BadRequestException('This project template has invalid milestone data.');
    const daysFromToday = milestone.daysFromToday ?? null;
    if (daysFromToday !== null && (typeof daysFromToday !== 'number' || !Number.isInteger(daysFromToday) || daysFromToday < -3650 || daysFromToday > 3650)) throw new BadRequestException('This project template has an invalid milestone date offset.');
    return { title: milestone.title.trim(), daysFromToday: daysFromToday as number | null };
  });
}

function dayOffsetFromToday(date: Date) {
  const now = new Date();
  const dueDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(-3650, Math.min(3650, Math.round((dueDay - today) / 86_400_000)));
}

function optionalUuid(value: unknown, label: string) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException(`${label} reference is invalid.`);
  }
  return value;
}
