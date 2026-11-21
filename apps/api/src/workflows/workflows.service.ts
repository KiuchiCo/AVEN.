import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionsService } from '../billing/permissions.service.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { WorkflowRunner } from './workflow-runner.service.js';
import { nextScheduledRun, parseWorkflow, type Step, type Trigger } from './workflow-rules.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService, private readonly runner: WorkflowRunner, private readonly entitlements: EntitlementsService, private readonly permissions: PermissionsService) {}

  private options() { return { allowPrivateWebhooks: readApiEnvironment().workflowAllowPrivateWebhooks }; }

  private async roleOf(workspaceId: string, userId: string) {
    return (await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } }))?.role;
  }

  /** Calling other systems and running a model inside a workflow are paid features. Workflows already saved are never removed. */
  private async assertSteps(workspaceId: string, steps: Step[]) {
    const advanced = (list: Step[]): boolean => list.some((step) => step.type === 'webhook' || step.type === 'ai' || ('then' in step && (advanced(step.then) || advanced(step.else))));
    if (advanced(steps)) await this.entitlements.assertFeature(workspaceId, 'advancedAutomation', 'Webhook and AI steps');
  }

  private scheduleFor(trigger: Trigger, enabled: boolean) {
    return enabled && trigger.type === 'schedule' ? nextScheduledRun(trigger, new Date()) : null;
  }

  async list(identity: AuthenticatedIdentity, workspaceId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const admin = ['OWNER', 'ADMINISTRATOR'].includes((await this.roleOf(workspaceId, userId)) ?? '');
    const rows = await this.prisma.workflow.findMany({
      where: { workspaceId }, orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true, enabled: true, trigger: true, nextRunAt: true, createdById: true, createdBy: { select: { displayName: true } }, runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, createdAt: true, error: true } } },
    });
    return rows.map(({ runs, createdById, ...row }) => ({ ...row, lastRun: runs[0] ?? null, canManage: admin || createdById === userId }));
  }

  async get(identity: AuthenticatedIdentity, workspaceId: string, workflowId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const workflow = await this.prisma.workflow.findFirst({ where: { id: workflowId, workspaceId }, include: { createdBy: { select: { displayName: true } } } });
    if (!workflow) throw new NotFoundException('Workflow not found in this workspace.');
    const admin = ['OWNER', 'ADMINISTRATOR'].includes((await this.roleOf(workspaceId, userId)) ?? '');
    return { ...workflow, canManage: admin || workflow.createdById === userId };
  }

  async create(identity: AuthenticatedIdentity, workspaceId: string, body: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    await this.permissions.assert(workspaceId, userId, 'automations');
    const input = parseWorkflow(body, this.options());
    await this.assertSteps(workspaceId, input.steps);
    await this.assertNameFree(workspaceId, input.name);
    const enabled = input.enabled ?? false;
    try {
      return await this.entitlements.addWithinLimit(workspaceId, 'workflows', async (transaction) => {
        const workflow = await transaction.workflow.create({ data: { workspaceId, createdById: userId, name: input.name, description: input.description, enabled, trigger: input.trigger as unknown as Prisma.InputJsonValue, steps: input.steps as unknown as Prisma.InputJsonValue, nextRunAt: this.scheduleFor(input.trigger, enabled) }, select: { id: true, name: true, enabled: true } });
        await transaction.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'AUTOMATION', entityId: workflow.id, message: `created workflow “${workflow.name}”` } });
        return workflow;
      });
    } catch (error) { throw this.conflict(error); }
  }

  async update(identity: AuthenticatedIdentity, workspaceId: string, workflowId: string, body: unknown) {
    const { workflow, userId } = await this.manageable(identity, workspaceId, workflowId);
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) throw new BadRequestException('Provide something to change.');
    const merged = { name: workflow.name, description: workflow.description, trigger: workflow.trigger, steps: workflow.steps, enabled: workflow.enabled, ...(body as Record<string, unknown>) };
    const input = parseWorkflow(merged, this.options());
    await this.assertSteps(workspaceId, input.steps);
    if (input.name.toLocaleLowerCase() !== workflow.name.toLocaleLowerCase()) await this.assertNameFree(workspaceId, input.name, workflow.id);
    const enabled = input.enabled ?? workflow.enabled;
    const triggerChanged = JSON.stringify(input.trigger) !== JSON.stringify(workflow.trigger);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.workflow.update({ where: { id: workflow.id }, data: { name: input.name, description: input.description, enabled, trigger: input.trigger as unknown as Prisma.InputJsonValue, steps: input.steps as unknown as Prisma.InputJsonValue, ...(triggerChanged || enabled !== workflow.enabled ? { nextRunAt: this.scheduleFor(input.trigger, enabled) } : {}) }, select: { id: true, name: true, enabled: true } });
        const message = enabled !== workflow.enabled && Object.keys(body as object).length === 1 ? `${enabled ? 'turned on' : 'turned off'} workflow “${updated.name}”` : `updated workflow “${updated.name}”`;
        await transaction.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'AUTOMATION', entityId: workflow.id, message } });
        return updated;
      });
    } catch (error) { throw this.conflict(error); }
  }

  async remove(identity: AuthenticatedIdentity, workspaceId: string, workflowId: string) {
    const { workflow, userId } = await this.manageable(identity, workspaceId, workflowId);
    await this.prisma.$transaction([
      this.prisma.workspaceActivity.create({ data: { workspaceId, actorId: userId, entityType: 'AUTOMATION', entityId: workflow.id, message: `deleted workflow “${workflow.name}”` } }),
      this.prisma.workflow.delete({ where: { id: workflow.id } }),
    ]);
    return { id: workflow.id, deleted: true };
  }

  /** Queues a manual run. It runs as the workflow's owner, with the owner's permissions. */
  async run(identity: AuthenticatedIdentity, workspaceId: string, workflowId: string, body: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const workflow = await this.prisma.workflow.findFirst({ where: { id: workflowId, workspaceId }, select: { id: true } });
    if (!workflow) throw new NotFoundException('Workflow not found in this workspace.');
    const taskId = body && typeof body === 'object' && !Array.isArray(body) ? (body as { taskId?: unknown }).taskId : undefined;
    if (taskId !== undefined && taskId !== null && taskId !== '') {
      if (typeof taskId !== 'string' || !uuid.test(taskId)) throw new BadRequestException('Choose a valid task.');
      if (!await this.prisma.task.findFirst({ where: { id: taskId, workspaceId }, select: { id: true } })) throw new NotFoundException('Task not found in this workspace.');
    }
    const run = await this.prisma.workflowRun.create({ data: { workflowId, workspaceId, trigger: { type: 'manual', startedBy: userId, ...(taskId ? { taskId } : {}) } }, select: { id: true, status: true } });
    this.runner.kick();
    return run;
  }

  async runs(identity: AuthenticatedIdentity, workspaceId: string, workflowId: string) {
    await requireWorkspaceMember(this.prisma, identity, workspaceId);
    if (!await this.prisma.workflow.findFirst({ where: { id: workflowId, workspaceId }, select: { id: true } })) throw new NotFoundException('Workflow not found in this workspace.');
    return this.prisma.workflowRun.findMany({
      where: { workflowId, workspaceId }, orderBy: { createdAt: 'desc' }, take: 30,
      select: { id: true, status: true, trigger: true, runAt: true, createdAt: true, startedAt: true, finishedAt: true, error: true, attempts: true, stepRuns: { orderBy: { startedAt: 'asc' }, select: { id: true, stepId: true, type: true, status: true, attempt: true, summary: true, startedAt: true } } },
    });
  }

  private async manageable(identity: AuthenticatedIdentity, workspaceId: string, workflowId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const workflow = await this.prisma.workflow.findFirst({ where: { id: workflowId, workspaceId } });
    if (!workflow) throw new NotFoundException('Workflow not found in this workspace.');
    await this.permissions.assert(workspaceId, userId, 'automations');
    const role = await this.roleOf(workspaceId, userId);
    if (workflow.createdById !== userId && role !== 'OWNER' && role !== 'ADMINISTRATOR') throw new ForbiddenException('Only the workflow’s creator or a workspace administrator can change it.');
    return { workflow, userId };
  }

  private async assertNameFree(workspaceId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.workflow.findFirst({ where: { workspaceId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (clash) throw new ConflictException('A workflow with that name already exists.');
  }

  private conflict(error: unknown) {
    return (error as { code?: unknown }).code === 'P2002' ? new ConflictException('A workflow with that name already exists.') : error;
  }
}
