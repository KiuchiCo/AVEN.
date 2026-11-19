import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { PrismaService } from '../database/prisma.service.js';
import { WorkflowTriggersService } from '../workflows/workflow-triggers.service.js';

const taskStatuses = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED', 'CANCELLED'] as const;
const taskPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const automationActions = ['SET_TASK_PRIORITY', 'ADD_ACTIVITY_NOTE'] as const;

@Injectable()
export class AutomationsService {
  constructor(private readonly prisma: PrismaService, private readonly triggers: WorkflowTriggersService) {}

  async list(identity: AuthenticatedIdentity, workspaceId: string) {
    await this.membership(identity, workspaceId);
    const [rules, runs] = await Promise.all([
      this.prisma.automationRule.findMany({
        where: { workspaceId }, orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
        include: { createdBy: { select: { displayName: true } }, _count: { select: { runs: true } } },
      }),
      this.prisma.automationRun.findMany({
        where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 30,
        include: { rule: { select: { name: true } }, task: { select: { id: true, title: true, labels: true } } },
      }),
    ]);
    return { rules, runs };
  }

  async create(identity: AuthenticatedIdentity, workspaceId: string, input: unknown) {
    const actorId = await this.membership(identity, workspaceId, true);
    const body = objectInput(input);
    const name = textField(body.name, 'Automation name', 120);
    const fromStatus = optionalEnum(body.fromStatus, taskStatuses, 'Starting task status');
    const toStatus = enumField(body.toStatus, taskStatuses, 'Target task status');
    const action = enumField(body.action, automationActions, 'Automation action');
    const priority = action === 'SET_TASK_PRIORITY' ? enumField(body.priority, taskPriorities, 'Task priority') : null;
    const activityMessage = action === 'ADD_ACTIVITY_NOTE' ? textField(body.activityMessage, 'Activity note', 500) : null;
    return this.prisma.$transaction(async (transaction) => {
      const rule = await transaction.automationRule.create({
        data: { workspaceId, createdById: actorId, name, fromStatus, toStatus, action, priority, activityMessage },
        include: { createdBy: { select: { displayName: true } }, _count: { select: { runs: true } } },
      });
      await transaction.workspaceActivity.create({ data: { workspaceId, actorId, entityType: 'AUTOMATION', entityId: rule.id, message: `created automation “${name}”` } });
      return rule;
    });
  }

  async update(identity: AuthenticatedIdentity, workspaceId: string, ruleId: string, input: unknown) {
    const actorId = await this.membership(identity, workspaceId, true);
    const body = objectInput(input);
    const data: { name?: string; enabled?: boolean } = {};
    if ('name' in body) data.name = textField(body.name, 'Automation name', 120);
    if ('enabled' in body) {
      if (typeof body.enabled !== 'boolean') throw new BadRequestException('Automation enabled state must be true or false.');
      data.enabled = body.enabled;
    }
    if (!Object.keys(data).length) throw new BadRequestException('Provide an automation name or enabled state to update.');
    const result = await this.prisma.automationRule.updateMany({ where: { id: ruleId, workspaceId }, data });
    if (!result.count) throw new NotFoundException('Automation not found in this workspace.');
    const rule = await this.prisma.automationRule.findFirstOrThrow({ where: { id: ruleId, workspaceId }, include: { createdBy: { select: { displayName: true } }, _count: { select: { runs: true } } } });
    await this.prisma.workspaceActivity.create({ data: { workspaceId, actorId, entityType: 'AUTOMATION', entityId: rule.id, message: `${rule.enabled ? 'enabled' : 'paused'} automation “${rule.name}”` } });
    return rule;
  }

  async remove(identity: AuthenticatedIdentity, workspaceId: string, ruleId: string) {
    const actorId = await this.membership(identity, workspaceId, true);
    const rule = await this.prisma.automationRule.findFirst({ where: { id: ruleId, workspaceId }, select: { id: true, name: true } });
    if (!rule) throw new NotFoundException('Automation not found in this workspace.');
    await this.prisma.$transaction([
      this.prisma.workspaceActivity.create({ data: { workspaceId, actorId, entityType: 'AUTOMATION', entityId: rule.id, message: `deleted automation “${rule.name}”` } }),
      this.prisma.automationRule.delete({ where: { id: rule.id } }),
    ]);
    return { id: ruleId, deleted: true };
  }

  async runForTaskStatusChange(workspaceId: string, taskId: string, fromStatus: string, toStatus: string, actorId: string) {
    if (fromStatus === toStatus) return;
    await this.triggers.enqueueForTask(workspaceId, taskId, { type: 'task_status_changed', fromStatus, toStatus });
    const rules = await this.prisma.automationRule.findMany({
      where: { workspaceId, enabled: true, toStatus: toStatus as (typeof taskStatuses)[number], ...(fromStatus ? { OR: [{ fromStatus: null }, { fromStatus: fromStatus as (typeof taskStatuses)[number] }] } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    for (const rule of rules) {
      const summary = rule.action === 'SET_TASK_PRIORITY'
        ? `Set “${rule.name}” task priority to ${(rule.priority ?? 'MEDIUM').toLocaleLowerCase()}.`
        : (rule.activityMessage ?? `Automation “${rule.name}” ran.`);
      try {
        await this.prisma.$transaction(async (transaction) => {
          if (rule.action === 'SET_TASK_PRIORITY' && rule.priority) {
            await transaction.task.updateMany({ where: { id: taskId, workspaceId }, data: { priority: rule.priority } });
          }
          await transaction.workspaceActivity.create({ data: { workspaceId, actorId, entityType: 'TASK', entityId: taskId, message: `${rule.name}: ${summary}` } });
          await transaction.automationRun.create({ data: { workspaceId, ruleId: rule.id, taskId, status: 'SUCCEEDED', summary } });
        });
      } catch {
        try {
          await this.prisma.automationRun.create({ data: { workspaceId, ruleId: rule.id, taskId, status: 'FAILED', summary: 'Automation could not be applied. Review the rule and try again.' } });
        } catch { /* Do not fail the user's task update if automation logging is unavailable. */ }
      }
    }
  }

  private membership(identity: AuthenticatedIdentity, workspaceId: string, write = false) {
    return requireWorkspaceMember(this.prisma, identity, workspaceId, write);
  }
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('A JSON object is required.');
  return input as Record<string, unknown>;
}

function textField(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label} must be between 1 and ${max} characters.`);
  return value.trim();
}

function enumField<const T extends readonly string[]>(value: unknown, choices: T, label: string): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) throw new BadRequestException(`${label} is invalid.`);
  return value as T[number];
}

function optionalEnum<const T extends readonly string[]>(value: unknown, choices: T, label: string): T[number] | null {
  if (value === undefined || value === null || value === '') return null;
  return enumField(value, choices, label);
}
