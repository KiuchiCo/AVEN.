import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EntitlementsService } from '../billing/entitlements.service.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { PrismaService } from '../database/prisma.service.js';
import { isWriteTool, monthWindow } from './ai-rules.js';
import { generalAgent, parseAgentInput, systemAgents, type AgentInput } from './agents.js';


@Injectable()
export class AiAgentsService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementsService) {}

  /** Built-in agents followed by this workspace's custom ones, each with this month's credit use. */
  async list(identity: AuthenticatedIdentity, workspaceId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const role = (await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } }))?.role;
    const { start, end } = monthWindow();
    const [custom, conversations, usage] = await Promise.all([
      this.prisma.aiAgent.findMany({ where: { workspaceId }, orderBy: { name: 'asc' } }),
      this.prisma.aiConversation.findMany({ where: { workspaceId }, select: { id: true, agentKey: true } }),
      this.prisma.aiUsage.groupBy({ by: ['conversationId'], where: { workspaceId, createdAt: { gte: start, lt: end } }, _sum: { credits: true } }),
    ]);
    const agentOf = new Map(conversations.map((conversation) => [conversation.id, conversation.agentKey]));
    const credits = new Map<string, number>(); const counts = new Map<string, number>();
    for (const conversation of conversations) counts.set(conversation.agentKey, (counts.get(conversation.agentKey) ?? 0) + 1);
    for (const row of usage) { const key = (row.conversationId && agentOf.get(row.conversationId)) || generalAgent.key; credits.set(key, (credits.get(key) ?? 0) + (row._sum.credits ?? 0)); }
    const shape = (agent: { key: string; name: string; description: string; instructions: string; tools: string[]; system: boolean }, canManage: boolean) => ({
      key: agent.key, name: agent.name, description: agent.description, instructions: agent.instructions, tools: agent.tools, writeTools: agent.tools.filter(isWriteTool),
      system: agent.system, canManage, creditsThisMonth: credits.get(agent.key) ?? 0, conversations: counts.get(agent.key) ?? 0,
    });
    const isAdmin = role === 'OWNER' || role === 'ADMINISTRATOR';
    return [generalAgent, ...systemAgents].map((agent) => shape(agent, false))
      .concat(custom.map((agent) => shape({ key: agent.id, name: agent.name, description: agent.description, instructions: agent.instructions, tools: agent.tools, system: false }, isAdmin || agent.createdById === userId)));
  }

  async create(identity: AuthenticatedIdentity, workspaceId: string, body: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const data = parseAgentInput(body) as AgentInput;
    await this.entitlements.assertFeature(workspaceId, 'aiAgents', 'Custom agents');
    await this.assertNameFree(workspaceId, data.name);
    try { return await this.entitlements.addWithinLimit(workspaceId, 'customAgents', (transaction) => transaction.aiAgent.create({ data: { workspaceId, createdById: userId, ...data }, select: { id: true, name: true } })); }
    catch (error) { throw this.conflict(error); }
  }

  async update(identity: AuthenticatedIdentity, workspaceId: string, agentId: string, body: unknown) {
    const agent = await this.manageable(identity, workspaceId, agentId);
    const data = parseAgentInput(body, true);
    if (!Object.keys(data).length) throw new BadRequestException('Provide something to change.');
    if (data.name) await this.assertNameFree(workspaceId, data.name, agent.id);
    try { return await this.prisma.aiAgent.update({ where: { id: agent.id }, data, select: { id: true, name: true } }); }
    catch (error) { throw this.conflict(error); }
  }

  /** Deleting an agent keeps its conversations; they continue with the general assistant. */
  async remove(identity: AuthenticatedIdentity, workspaceId: string, agentId: string) {
    const agent = await this.manageable(identity, workspaceId, agentId);
    await this.prisma.aiAgent.delete({ where: { id: agent.id } });
    return { id: agent.id, deleted: true };
  }

  private async manageable(identity: AuthenticatedIdentity, workspaceId: string, agentId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, true);
    const agent = await this.prisma.aiAgent.findFirst({ where: { id: agentId, workspaceId }, select: { id: true, createdById: true } });
    if (!agent) throw new NotFoundException('Agent not found in this workspace.');
    const role = (await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } }))?.role;
    if (agent.createdById !== userId && role !== 'OWNER' && role !== 'ADMINISTRATOR') throw new ForbiddenException('Only the agent’s creator or a workspace administrator can change it.');
    return agent;
  }

  /** The database index is case-sensitive, so “Helper” and “helper” are caught here. */
  private async assertNameFree(workspaceId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.aiAgent.findFirst({ where: { workspaceId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (clash) throw new ConflictException('An agent with that name already exists.');
  }

  private conflict(error: unknown) {
    return (error as { code?: unknown }).code === 'P2002' ? new ConflictException('An agent with that name already exists.') : error;
  }
}
