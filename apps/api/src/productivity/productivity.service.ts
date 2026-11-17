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

  async listWorkspaceMembers(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.requireMembership(identity, workspaceId);
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId }, orderBy: { createdAt: 'asc' },
      select: { userId: true, role: true, user: { select: { displayName: true } } },
    });
    return members.map(({ user, ...membership }) => ({ ...membership, displayName: user.displayName }));
  }

  async listWorkspaceActivity(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.requireMembership(identity, workspaceId);
    return this.prisma.workspaceActivity.findMany({
      where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { actor: { select: { displayName: true } } },
    });
  }

  async createProject(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await this.requireMembership(identity, workspaceId);
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
    const actorId = await this.requireMembership(identity, workspaceId);
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
    const actorId = await this.requireMembership(identity, workspaceId);
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
    const actorId = await this.requireMembership(identity, workspaceId);
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

  async listTasks(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.requireMembership(identity, workspaceId);
    return this.prisma.task.findMany({
      where: { workspaceId },
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

  async createTask(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const userId = await this.requireMembership(identity, workspaceId);
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
        completedAt: status === 'COMPLETED' ? new Date() : null,
      },
      include: { project: { select: { id: true, name: true } }, assignee: { select: { id: true, displayName: true } } },
    });
    await this.recordActivity(workspaceId, userId, 'TASK', task.id, `created task “${task.title}”`);
    return task;
  }

  async updateTask(identity: AuthenticatedIdentity, workspaceId: string, taskId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId);
    const body = objectInput(input);
    const data: {
      title?: string;
      description?: string | null;
      status?: TaskStatus;
      priority?: TaskPriority;
      dueAt?: Date | null;
      completedAt?: Date | null;
      assigneeId?: string | null;
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
    const task = await this.prisma.task.findFirstOrThrow({
      where: { id: taskId, workspaceId },
      include: { project: { select: { id: true, name: true } }, assignee: { select: { id: true, displayName: true } } },
    });
    await this.recordActivity(workspaceId, actorId, 'TASK', task.id, `updated task “${task.title}”`);
    return task;
  }

  async setTaskDependencies(identity: AuthenticatedIdentity, workspaceId: string, taskId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId);
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
    await this.recordActivity(workspaceId, actorId, 'TASK', task.id, `updated dependencies for task “${task.title}”`);
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
    const actorId = await this.requireMembership(identity, workspaceId);
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
    const actorId = await this.requireMembership(identity, workspaceId);
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
    const actorId = await this.requireMembership(identity, workspaceId);
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
    const actorId = await this.requireMembership(identity, workspaceId);
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
    const actorId = await this.requireMembership(identity, workspaceId);
    const body = objectInput(input);
    const message = textField(body.body, 'Comment', 2000);
    const document = await this.requireDocument(workspaceId, documentId);
    const comment = await this.prisma.documentComment.create({ data: { workspaceId, documentId, createdById: actorId, body: message }, include: { createdBy: { select: { id: true, displayName: true } } } });
    await this.recordActivity(workspaceId, actorId, 'DOCUMENT', documentId, `commented on “${document.title}”`);
    return comment;
  }

  async resolveDocumentComment(identity: AuthenticatedIdentity, workspaceId: string, documentId: string, commentId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId);
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
      include: { task: { select: { id: true, title: true } } },
    });
  }

  async searchWorkspace(identity: AuthenticatedIdentity, workspaceId: string, rawQuery: unknown) {
    await this.requireMembership(identity, workspaceId);
    if (typeof rawQuery !== 'string' || rawQuery.trim().length < 2 || rawQuery.trim().length > 100) {
      throw new BadRequestException('Search must be between 2 and 100 characters.');
    }
    const query = rawQuery.trim();
    const contains = { contains: query, mode: 'insensitive' as const };
    const [projects, tasks, documents, databases, records] = await Promise.all([
      this.prisma.project.findMany({ where: { workspaceId, OR: [{ name: contains }, { description: contains }] }, orderBy: { updatedAt: 'desc' }, take: 12, select: { id: true, name: true, description: true, updatedAt: true } }),
      this.prisma.task.findMany({ where: { workspaceId, OR: [{ title: contains }, { description: contains }] }, orderBy: { updatedAt: 'desc' }, take: 12, select: { id: true, title: true, description: true, updatedAt: true, project: { select: { name: true } } } }),
      this.prisma.document.findMany({ where: { workspaceId, OR: [{ title: contains }, { content: contains }] }, orderBy: { updatedAt: 'desc' }, take: 12, select: { id: true, title: true, content: true, updatedAt: true } }),
      this.prisma.workspaceDatabase.findMany({ where: { workspaceId, OR: [{ name: contains }, { description: contains }] }, orderBy: { updatedAt: 'desc' }, take: 8, select: { id: true, name: true, description: true, updatedAt: true } }),
      this.prisma.databaseRecord.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, take: 300, select: { id: true, values: true, updatedAt: true, database: { select: { id: true, name: true } } } }),
    ]);
    const needle = query.toLocaleLowerCase();
    const results = [
      ...projects.map((item) => ({ id: item.id, type: 'Project', title: item.name, detail: item.description ?? 'Project', href: '/workspace/projects', updatedAt: item.updatedAt })),
      ...tasks.map((item) => ({ id: item.id, type: 'Task', title: item.title, detail: item.project?.name ?? item.description ?? 'Workspace task', href: '/workspace/tasks', updatedAt: item.updatedAt })),
      ...documents.map((item) => {
        const content = documentPlainText(item.content);
        return { id: item.id, type: 'Document', title: item.title, detail: content.toLocaleLowerCase().includes(needle) ? excerpt(content, needle) : 'Workspace document', href: `/workspace/documents/${item.id}`, updatedAt: item.updatedAt };
      }),
      ...databases.map((item) => ({ id: item.id, type: 'Database', title: item.name, detail: item.description ?? 'Workspace database', href: '/workspace/databases', updatedAt: item.updatedAt })),
      ...records.filter((item) => JSON.stringify(item.values).toLocaleLowerCase().includes(needle)).slice(0, 12).map((item) => ({ id: item.id, type: 'Record', title: recordTitle(item.values), detail: item.database.name, href: '/workspace/databases', updatedAt: item.updatedAt })),
    ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 40);
    return { query, results };
  }

  async createCalendarEvent(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const actorId = await this.requireMembership(identity, workspaceId);
    const body = objectInput(input);
    const taskId = optionalUuid(body.taskId, 'Task');
    if (taskId) {
      const task = await this.prisma.task.findFirst({ where: { id: taskId, workspaceId }, select: { id: true, title: true } });
      if (!task) throw new NotFoundException('Task not found in this workspace.');
    }
    const startsAt = requiredDate(body.startsAt, 'Start time');
    const endsAt = dateField(body.endsAt, 'End time');
    if (endsAt && endsAt <= startsAt) throw new BadRequestException('End time must be after the start time.');
    const event = await this.prisma.calendarEvent.create({
      data: {
        workspaceId,
        taskId,
        title: textField(body.title, 'Event title', 200),
        startsAt,
        endsAt,
      },
      include: { task: { select: { id: true, title: true } } },
    });
    await this.recordActivity(workspaceId, actorId, 'CALENDAR', event.id, `scheduled “${event.title}”`);
    return event;
  }

  private recordActivity(workspaceId: string, actorId: string, entityType: string, entityId: string, message: string) {
    return this.prisma.workspaceActivity.create({ data: { workspaceId, actorId, entityType, entityId, message } });
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

function optionalUuid(value: unknown, label: string) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException(`${label} reference is invalid.`);
  }
  return value;
}
