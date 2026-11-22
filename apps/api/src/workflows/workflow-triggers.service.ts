import { reportJobFailure } from '../observability/error-reporter.js';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Trigger } from './workflow-rules.js';
import { workflowContext } from './workflow-context.js';

export const MAX_RUNS_PER_HOUR = 60;

export type TaskEvent = { type: 'task_created' } | { type: 'task_status_changed'; fromStatus: string; toStatus: string };

/** Queues runs when something happens in the app. Uses only the database, so any part of the app can call it. */
@Injectable()
export class WorkflowTriggersService {
  private readonly logger = new Logger('Workflows');

  constructor(private readonly prisma: PrismaService) {}

  /** Never throws: a problem with workflows must not break the task change that caused it. */
  async enqueueForTask(workspaceId: string, taskId: string, event: TaskEvent) {
    if (workflowContext.getStore()) return;
    try {
      const workflows = await this.prisma.workflow.findMany({ where: { workspaceId, enabled: true }, select: { id: true, trigger: true } });
      const matching = workflows.filter((workflow) => {
        const trigger = workflow.trigger as unknown as Trigger;
        if (trigger.type !== event.type) return false;
        if (trigger.type === 'task_status_changed' && event.type === 'task_status_changed') return trigger.toStatus === event.toStatus && (!trigger.fromStatus || trigger.fromStatus === event.fromStatus);
        return true;
      });
      const hourAgo = new Date(Date.now() - 3_600_000);
      for (const workflow of matching) {
        // A runaway trigger (for example a bulk import) is capped rather than flooding the queue.
        if (await this.prisma.workflowRun.count({ where: { workflowId: workflow.id, createdAt: { gte: hourAgo } } }) >= MAX_RUNS_PER_HOUR) continue;
        await this.prisma.workflowRun.create({ data: { workflowId: workflow.id, workspaceId, trigger: { ...event, taskId } } });
      }
    } catch (error) {
      reportJobFailure('workflow-trigger', error);
      this.logger.warn(`Could not queue workflows: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
}
