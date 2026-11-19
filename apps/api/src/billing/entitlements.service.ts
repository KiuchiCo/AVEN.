import { HttpException, Injectable } from '@nestjs/common';
import { monthWindow } from '../ai/ai-rules.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { PrismaService } from '../database/prisma.service.js';
import { buildCatalog, limitMessage, resolveEntitlements, withinLimit, type Entitlements, type Feature, type LimitKey, type Plan, type PlanKey } from './plans.js';

export type CountedResource = 'projects' | 'databases' | 'workflows' | 'customAgents';

/** What a workspace's plan allows, and the checks that enforce it. Refusals are 402 (payment required) with a plain message. */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  catalog(): Record<PlanKey, Plan> {
    const env = readApiEnvironment();
    return buildCatalog({ storageBytes: env.storageQuotaBytes, aiCredits: env.aiMonthlyCredits }, env.billingPlanOverrides);
  }

  async forWorkspace(workspaceId: string): Promise<Entitlements> {
    const subscription = await this.prisma.subscription.findUnique({ where: { workspaceId }, select: { planKey: true, status: true, seats: true, limitsOverride: true } });
    return resolveEntitlements(subscription, this.catalog());
  }

  async limit(workspaceId: string, key: LimitKey): Promise<number | null> {
    return (await this.forWorkspace(workspaceId)).limits[key];
  }

  /** People other than Guests, counting invitations that have not been accepted yet. */
  async memberCount(workspaceId: string, options: { includePending?: boolean } = {}): Promise<number> {
    const members = await this.prisma.workspaceMember.count({ where: { workspaceId, role: { not: 'GUEST' } } });
    if (!options.includePending) return members;
    const pending = await this.prisma.workspaceInvite.count({ where: { workspaceId, status: 'PENDING', expiresAt: { gt: new Date() }, role: { not: 'GUEST' } } });
    return members + pending;
  }

  private count(workspaceId: string, resource: CountedResource): Promise<number> {
    switch (resource) {
      case 'projects': return this.prisma.project.count({ where: { workspaceId } });
      case 'databases': return this.prisma.workspaceDatabase.count({ where: { workspaceId } });
      case 'workflows': return this.prisma.workflow.count({ where: { workspaceId } });
      case 'customAgents': return this.prisma.aiAgent.count({ where: { workspaceId } });
    }
  }

  /** Refuses with 402 when the workspace already has as many as its plan allows. Existing items are never touched. */
  async assertCanAdd(workspaceId: string, resource: CountedResource): Promise<void> {
    const entitlements = await this.forWorkspace(workspaceId);
    const limit = entitlements.limits[resource];
    if (!withinLimit(await this.count(workspaceId, resource), limit)) throw new HttpException(limitMessage(resource, limit ?? 0, entitlements.plan.name), 402);
  }

  /** `extra` is how many people are about to be added besides those already counted. */
  async assertCanAddMember(workspaceId: string, options: { includePending: boolean }): Promise<void> {
    const entitlements = await this.forWorkspace(workspaceId);
    const limit = entitlements.limits.members;
    if (!withinLimit(await this.memberCount(workspaceId, options), limit)) throw new HttpException(`${limitMessage('members', limit ?? 0, entitlements.plan.name)} Guests don’t count.`, 402);
  }

  async hasFeature(workspaceId: string, feature: Feature): Promise<boolean> {
    return (await this.forWorkspace(workspaceId)).features.has(feature);
  }

  async assertFeature(workspaceId: string, feature: Feature, what: string): Promise<void> {
    const entitlements = await this.forWorkspace(workspaceId);
    if (!entitlements.features.has(feature)) {
      const upgrade = Object.values(this.catalog()).filter((plan) => plan.selfServe && plan.features.includes(feature)).map((plan) => plan.name);
      throw new HttpException(`${what} isn’t included in the ${entitlements.plan.name} plan${upgrade.length ? `. It’s available on ${upgrade.join(' and ')}` : ''}.`, 402);
    }
  }

  async aiCreditsUsed(workspaceId: string): Promise<number> {
    const { start, end } = monthWindow();
    const total = await this.prisma.aiUsage.aggregate({ where: { workspaceId, createdAt: { gte: start, lt: end } }, _sum: { credits: true } });
    return total._sum.credits ?? 0;
  }

  /** Current use of everything a plan limits. */
  async usage(workspaceId: string) {
    const [projects, databases, workflows, customAgents, members, files, versions, aiCreditsUsed] = await Promise.all([
      this.count(workspaceId, 'projects'), this.count(workspaceId, 'databases'), this.count(workspaceId, 'workflows'), this.count(workspaceId, 'customAgents'), this.memberCount(workspaceId),
      this.prisma.storedFile.aggregate({ where: { workspaceId }, _sum: { sizeBytes: true } }), this.prisma.fileVersion.aggregate({ where: { workspaceId }, _sum: { sizeBytes: true } }), this.aiCreditsUsed(workspaceId),
    ]);
    return { projects, databases, workflows, customAgents, members, storageBytes: (files._sum.sizeBytes ?? 0) + (versions._sum.sizeBytes ?? 0), aiCredits: aiCreditsUsed };
  }
}
