import { BadRequestException, Injectable } from '@nestjs/common';
import { viewerOf, visibleTaskWhere } from '../productivity/project-rules.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { buildAnalytics } from './analytics-rules.js';

const MAX_TASKS = 20_000;
const windows = [7, 30, 90] as const;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementsService) {}

  async overview(identity: AuthenticatedIdentity, workspaceId: string, query: { days?: string }) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const viewer = await viewerOf(this.prisma, workspaceId, userId);
    await this.entitlements.assertFeature(workspaceId, 'analytics', 'Analytics');
    const days = query.days === undefined ? 30 : Number(query.days);
    if (!(windows as readonly number[]).includes(days)) throw new BadRequestException(`Choose ${windows.join(', ')} days.`);
    const now = new Date(); const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * 86_400_000);
    const [tasks, usage, members] = await Promise.all([
      this.prisma.task.findMany({
        where: { workspaceId, AND: [visibleTaskWhere(viewer)], OR: [{ status: { notIn: ['COMPLETED', 'CANCELLED'] } }, { createdAt: { gte: since } }, { completedAt: { gte: since } }] },
        select: { id: true, status: true, priority: true, assigneeId: true, createdAt: true, completedAt: true, dueAt: true }, take: MAX_TASKS,
      }),
      this.prisma.$queryRaw<{ day: string; credits: number }[]>`SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COALESCE(sum(credits), 0)::int AS credits FROM ai_usage WHERE "workspaceId" = ${workspaceId}::uuid AND "createdAt" >= ${since} GROUP BY 1`,
      this.prisma.workspaceMember.findMany({ where: { workspaceId }, select: { userId: true, user: { select: { displayName: true } } } }),
    ]);
    return { ...buildAnalytics({ tasks, usage, now, days, names: new Map(members.map((member) => [member.userId, member.user.displayName])) }), truncated: tasks.length >= MAX_TASKS };
  }
}
