import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { requireWorkspaceMember } from '../auth/workspace-access.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { IntelligenceService } from '../productivity/intelligence.service.js';
import { ProductivityService } from '../productivity/productivity.service.js';
import { allTools, checkToolInput, citedSources, clip, creditsFor, describeAction, documentText, estimateTokens, isWriteTool, monthWindow, parseDecision, parseUserMessage, systemPrompt, toDocumentContent, windowHistory, type SourceRef, type StoredTurn } from './ai-rules.js';
import { agentSection, generalAgent, systemAgents, type AgentDefinition } from './agents.js';
import type { LlmBlock, LlmMessage } from './llm.js';
import { AI_SETTINGS, LLM_PROVIDER, type AiSettings, type OptionalProvider } from './tokens.js';

export type PendingAction = { id: string; tool: string; summary?: string; details?: string[]; input: Record<string, unknown>; status: 'pending' | 'confirmed' | 'declined' | 'failed'; result?: { id: string; title: string; href: string }; error?: string };
export type AiEvent =
  | { type: 'delta'; text: string }
  | { type: 'status'; text: string }
  | { type: 'citations'; sources: SourceRef[] }
  | { type: 'action'; action: PendingAction }
  | { type: 'done'; messageId: string; creditsUsed: number }
  | { type: 'error'; message: string };

const MAX_STEPS = 6;
const statusText: Record<string, string> = { search_workspace: 'Searching the workspace…', list_tasks: 'Looking at tasks…', list_projects: 'Looking at projects…', get_document: 'Reading a document…', get_briefing: 'Checking this week…', create_task: 'Preparing a task for your review…', update_task: 'Preparing a change for your review…', create_document: 'Drafting a document for your review…', create_event: 'Preparing an event for your review…' };
const isoDay = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
const sourceHref = (type: string, id: string) => type === 'Task' ? `/workspace/tasks/${id}` : type === 'Project' ? `/workspace/projects/${id}` : type === 'Document' ? `/workspace/documents/${id}` : type === 'Knowledge' ? '/workspace/knowledge' : type === 'Event' ? '/workspace/calendar' : '/workspace/databases';
const sourceType = (type: string): SourceRef['type'] => ({ Task: 'task', Project: 'project', Document: 'document', Knowledge: 'knowledge', Event: 'event', Database: 'database', Record: 'record' } as const)[type as 'Task'] ?? 'record';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productivity: ProductivityService,
    private readonly intelligence: IntelligenceService,
    @Inject(LLM_PROVIDER) private readonly provider: OptionalProvider,
    @Inject(AI_SETTINGS) private readonly settings: AiSettings,
  ) {}

  // ---- status, usage ---------------------------------------------------------------------------------------

  private async creditsUsed(workspaceId: string) {
    const { start, end } = monthWindow();
    const total = await this.prisma.aiUsage.aggregate({ where: { workspaceId, createdAt: { gte: start, lt: end } }, _sum: { credits: true } });
    return total._sum.credits ?? 0;
  }

  async status(identity: AuthenticatedIdentity, workspaceId: string) {
    await requireWorkspaceMember(this.prisma, identity, workspaceId);
    return { configured: this.provider !== null, provider: this.provider?.name ?? null, model: this.settings.model, creditsUsed: await this.creditsUsed(workspaceId), creditsLimit: this.settings.monthlyCredits, resetsAt: monthWindow().end };
  }

  // ---- conversations ---------------------------------------------------------------------------------------

  private async own(userId: string, workspaceId: string, conversationId: string) {
    const conversation = await this.prisma.aiConversation.findFirst({ where: { id: conversationId, workspaceId, userId }, select: { id: true, title: true, agentKey: true } });
    if (!conversation) throw new NotFoundException('Conversation not found.');
    return conversation;
  }

  async list(identity: AuthenticatedIdentity, workspaceId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    return this.prisma.aiConversation.findMany({ where: { workspaceId, userId }, orderBy: { updatedAt: 'desc' }, take: 50, select: { id: true, title: true, agentKey: true, updatedAt: true } });
  }

  /** Looks up an agent by key. A deleted custom agent falls back to the general assistant so old conversations keep working. */
  async agentFor(workspaceId: string, key: string): Promise<AgentDefinition> {
    if (key === generalAgent.key) return generalAgent;
    const builtIn = systemAgents.find((agent) => agent.key === key);
    if (builtIn) return builtIn;
    if (/^[0-9a-f-]{36}$/i.test(key)) {
      const custom = await this.prisma.aiAgent.findFirst({ where: { id: key, workspaceId } });
      if (custom) return { key: custom.id, name: custom.name, description: custom.description, instructions: custom.instructions, tools: custom.tools, system: false };
    }
    return generalAgent;
  }

  async create(identity: AuthenticatedIdentity, workspaceId: string, body: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const requested = body && typeof body === 'object' && !Array.isArray(body) ? (body as { agentKey?: unknown }).agentKey : undefined;
    let agentKey: string = generalAgent.key;
    if (requested !== undefined && requested !== null) {
      if (typeof requested !== 'string') throw new BadRequestException('Choose one of the listed agents.');
      const agent = await this.agentFor(workspaceId, requested);
      if (agent.key !== requested) throw new BadRequestException('That agent does not exist in this workspace.');
      agentKey = agent.key;
    }
    return this.prisma.aiConversation.create({ data: { workspaceId, userId, title: 'New conversation', agentKey }, select: { id: true, title: true, agentKey: true, updatedAt: true } });
  }

  async remove(identity: AuthenticatedIdentity, workspaceId: string, conversationId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const conversation = await this.own(userId, workspaceId, conversationId);
    await this.prisma.aiConversation.delete({ where: { id: conversation.id } });
    return { id: conversation.id, deleted: true };
  }

  /** What the chat shows: member messages and assistant answers, not the internal tool turns. */
  async get(identity: AuthenticatedIdentity, workspaceId: string, conversationId: string) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const conversation = await this.own(userId, workspaceId, conversationId);
    const rows = await this.prisma.aiMessage.findMany({ where: { conversationId, kind: 'text' }, orderBy: { createdAt: 'asc' } });
    const messages = rows.map((row) => ({
      id: row.id, role: row.role, createdAt: row.createdAt,
      text: (row.content as LlmBlock[]).filter((block) => block.type === 'text').map((block) => (block as { text: string }).text).join(''),
      citations: row.citations as SourceRef[], actions: row.pendingActions as PendingAction[],
    })).filter((message) => message.text || message.actions.length);
    return { id: conversation.id, title: conversation.title, agentKey: conversation.agentKey, messages };
  }

  // ---- sending a message -----------------------------------------------------------------------------------

  /** Validates everything that can fail before streaming starts, stores the member's message, and returns the run. */
  async prepare(identity: AuthenticatedIdentity, workspaceId: string, conversationId: string, body: unknown) {
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId);
    const text = parseUserMessage(body);
    if (!this.provider) throw new ServiceUnavailableException('AVEN Intelligence needs a model provider. Set ANTHROPIC_API_KEY for the API and restart it.');
    const conversation = await this.own(userId, workspaceId, conversationId);
    if (await this.creditsUsed(workspaceId) >= this.settings.monthlyCredits) throw new HttpException('This workspace has used its AI credits for the month. They reset at the start of next month.', 402);
    const membership = await this.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } });
    const rows = await this.prisma.aiMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, select: { role: true, kind: true, content: true } });
    const history: StoredTurn[] = rows.map((row) => ({ role: row.role as 'user' | 'assistant', kind: row.kind as 'text' | 'tool_result', blocks: row.content as LlmBlock[] }));
    await this.prisma.$transaction([
      this.prisma.aiMessage.create({ data: { conversationId, role: 'user', kind: 'text', content: [{ type: 'text', text }] as unknown as Prisma.InputJsonValue } }),
      this.prisma.aiConversation.update({ where: { id: conversationId }, data: { ...(rows.length === 0 ? { title: text.replace(/\s+/g, ' ').slice(0, 60) } : {}) } }),
    ]);
    const agent = await this.agentFor(workspaceId, conversation.agentKey);
    const context = { identity, workspaceId, userId, conversationId, canWrite: membership?.role !== 'GUEST', agent };
    return (emit: (event: AiEvent) => void, signal: AbortSignal) => this.run(context, [...windowHistory(history), { role: 'user' as const, content: [{ type: 'text' as const, text }] }], emit, signal);
  }

  private async run(context: { identity: AuthenticatedIdentity; workspaceId: string; userId: string; conversationId: string; canWrite: boolean; agent: AgentDefinition }, messages: LlmMessage[], emit: (event: AiEvent) => void, signal: AbortSignal) {
    const provider = this.provider!;
    const workspace = await this.prisma.workspace.findUnique({ where: { id: context.workspaceId }, select: { name: true } });
    const system = systemPrompt(workspace?.name ?? 'workspace', new Date()) + agentSection(context.agent);
    const tools = allToolsFor(context.agent.tools, context.canWrite);
    const candidates: SourceRef[] = [];
    const actions: PendingAction[] = [];
    let creditsUsed = 0;

    for (let step = 0; step < MAX_STEPS; step += 1) {
      const blocks: LlmBlock[] = [];
      const calls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
      let pending = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let streamed = '';
      try {
        for await (const event of provider.stream({ system, messages, tools, maxTokens: this.settings.maxOutputTokens, signal })) {
          if (event.type === 'text') { pending += event.text; streamed += event.text; emit({ type: 'delta', text: event.text }); }
          else if (event.type === 'tool_use') { if (pending) { blocks.push({ type: 'text', text: pending }); pending = ''; } blocks.push({ type: 'tool_use', id: event.id, name: event.name, input: event.input }); calls.push(event); }
          else if (event.type === 'usage') { inputTokens = event.inputTokens; outputTokens = event.outputTokens; }
        }
      } catch (error) {
        // Charge only if the model actually produced something. A request the provider rejected up front costs nothing.
        if (streamed || calls.length || inputTokens || outputTokens) {
          if (!inputTokens && !outputTokens) { inputTokens = estimateTokens(system + JSON.stringify(messages)); outputTokens = estimateTokens(streamed); }
          creditsUsed += await this.recordUsage(context, inputTokens, outputTokens);
        }
        if (signal.aborted) {
          if (streamed) await this.prisma.aiMessage.create({ data: { conversationId: context.conversationId, role: 'assistant', kind: 'text', content: [{ type: 'text', text: streamed }], model: provider.model, inputTokens, outputTokens } });
          return;
        }
        throw error;
      }
      if (pending) blocks.push({ type: 'text', text: pending });
      creditsUsed += await this.recordUsage(context, inputTokens, outputTokens);

      if (!calls.length) {
        const answer = blocks.filter((block) => block.type === 'text').map((block) => (block as { text: string }).text).join('');
        const sources = citedSources(candidates, answer);
        const saved = await this.prisma.aiMessage.create({ data: { conversationId: context.conversationId, role: 'assistant', kind: 'text', content: (blocks.length ? blocks : [{ type: 'text', text: '(No answer was returned.)' }]) as unknown as Prisma.InputJsonValue, citations: sources as unknown as Prisma.InputJsonValue, pendingActions: actions as unknown as Prisma.InputJsonValue, model: provider.model, inputTokens, outputTokens } });
        await this.prisma.aiConversation.update({ where: { id: context.conversationId }, data: { updatedAt: new Date() } });
        if (sources.length) emit({ type: 'citations', sources });
        emit({ type: 'done', messageId: saved.id, creditsUsed });
        return;
      }

      const results: LlmBlock[] = [];
      for (const call of calls) {
        emit({ type: 'status', text: statusText[call.name] ?? 'Working…' });
        results.push(await this.runTool(context, call, candidates, actions, emit));
      }
      const assistantTurn: LlmMessage = { role: 'assistant', content: blocks };
      const resultTurn: LlmMessage = { role: 'user', content: results };
      await this.prisma.$transaction([
        this.prisma.aiMessage.create({ data: { conversationId: context.conversationId, role: 'assistant', kind: 'text', content: blocks as unknown as Prisma.InputJsonValue, model: provider.model, inputTokens, outputTokens } }),
        this.prisma.aiMessage.create({ data: { conversationId: context.conversationId, role: 'user', kind: 'tool_result', content: results as unknown as Prisma.InputJsonValue } }),
      ]);
      messages = [...messages, assistantTurn, resultTurn];
    }
    const text = 'I couldn’t finish that within the allowed number of steps. Try asking a narrower question.';
    const saved = await this.prisma.aiMessage.create({ data: { conversationId: context.conversationId, role: 'assistant', kind: 'text', content: [{ type: 'text', text }], pendingActions: actions as unknown as Prisma.InputJsonValue, model: provider.model } });
    emit({ type: 'delta', text }); emit({ type: 'done', messageId: saved.id, creditsUsed });
  }

  private async recordUsage(context: { workspaceId: string; userId: string; conversationId: string }, inputTokens: number, outputTokens: number) {
    const credits = creditsFor(inputTokens, outputTokens);
    await this.prisma.aiUsage.create({ data: { workspaceId: context.workspaceId, userId: context.userId, conversationId: context.conversationId, model: this.provider!.model, inputTokens, outputTokens, credits } });
    return credits;
  }

  // ---- tools -----------------------------------------------------------------------------------------------

  private async runTool(context: { identity: AuthenticatedIdentity; workspaceId: string; userId: string; canWrite: boolean; agent: AgentDefinition }, call: { id: string; name: string; input: Record<string, unknown> }, candidates: SourceRef[], actions: PendingAction[], emit: (event: AiEvent) => void): Promise<LlmBlock> {
    const answer = (content: string, isError = false): LlmBlock => ({ type: 'tool_result', tool_use_id: call.id, content: clip(content), ...(isError ? { is_error: true } : {}) });
    if (!context.agent.tools.includes(call.name)) return answer(`The ${context.agent.name} role does not have the ${call.name} tool.`, true);
    const checked = checkToolInput(call.name, call.input);
    if (!checked.ok) return answer(checked.error, true);
    const input = checked.value;
    try {
      if (isWriteTool(call.name)) {
        if (!context.canWrite) return answer('This member has read-only access, so nothing can be changed.', true);
        let taskTitle: string | undefined;
        if (call.name === 'update_task') {
          const task = await this.prisma.task.findFirst({ where: { id: input.taskId as string, workspaceId: context.workspaceId }, select: { title: true } });
          if (!task) return answer('That task was not found in this workspace. Look it up with list_tasks first.', true);
          taskTitle = task.title;
        }
        const action: PendingAction = { id: randomUUID(), tool: call.name, ...describeAction(call.name, input, taskTitle), input, status: 'pending' };
        actions.push(action); emit({ type: 'action', action });
        return answer('Proposed. Nothing has changed yet: the user must review and confirm it in the app.');
      }
      const { text, sources } = await this.readTool(context, call.name, input);
      candidates.push(...sources);
      return answer(text);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) return answer(error.message, true);
      return answer('That lookup failed. Tell the user you could not retrieve it.', true);
    }
  }

  private async readTool(context: { identity: AuthenticatedIdentity; workspaceId: string; userId: string }, name: string, input: Record<string, unknown>): Promise<{ text: string; sources: SourceRef[] }> {
    const { workspaceId, identity, userId } = context;
    switch (name) {
      case 'search_workspace': {
        const found = (await this.productivity.searchWorkspace(identity, workspaceId, input.query)).results.slice(0, 15);
        return { text: JSON.stringify(found.map((item) => ({ type: item.type, id: item.id, title: item.title, detail: String(item.detail).slice(0, 240) }))), sources: found.map((item) => ({ type: sourceType(item.type), id: item.id, title: item.title, href: sourceHref(item.type, item.id) })) };
      }
      case 'list_tasks': {
        const where: Prisma.TaskWhereInput = { workspaceId, ...(input.status === 'open' ? { status: { notIn: ['COMPLETED', 'CANCELLED'] } } : input.status === 'completed' ? { status: 'COMPLETED' } : {}), ...(input.assignedToMe ? { assigneeId: userId } : {}), ...(input.projectId ? { projectId: input.projectId as string } : {}) };
        if (typeof input.dueWithinDays === 'number') { const end = new Date(); end.setUTCHours(23, 59, 59, 999); end.setUTCDate(end.getUTCDate() + input.dueWithinDays); where.dueAt = { not: null, lte: end }; }
        const tasks = await this.prisma.task.findMany({ where, orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }], take: input.limit as number, include: { project: { select: { name: true } }, assignee: { select: { displayName: true } } } });
        const now = new Date();
        return { text: JSON.stringify(tasks.map((task) => ({ id: task.id, title: task.title, status: task.status, priority: task.priority, due: isoDay(task.dueAt), overdue: Boolean(task.dueAt && task.dueAt < now && !['COMPLETED', 'CANCELLED'].includes(task.status)), project: task.project?.name ?? null, assignee: task.assignee?.displayName ?? null, labels: task.labels }))), sources: tasks.map((task) => ({ type: 'task' as const, id: task.id, title: task.title, href: `/workspace/tasks/${task.id}` })) };
      }
      case 'list_projects': {
        const projects = await this.prisma.project.findMany({ where: { workspaceId, ...(input.status === 'active' ? { status: { in: ['PLANNING', 'IN_PROGRESS', 'ON_HOLD'] } } : {}) }, orderBy: { updatedAt: 'desc' }, take: 25, include: { _count: { select: { tasks: true } }, tasks: { where: { status: 'COMPLETED' }, select: { id: true } } } });
        return { text: JSON.stringify(projects.map((project) => ({ id: project.id, name: project.name, status: project.status, due: isoDay(project.dueAt), tasksTotal: project._count.tasks, tasksCompleted: project.tasks.length }))), sources: projects.map((project) => ({ type: 'project' as const, id: project.id, title: project.name, href: `/workspace/projects/${project.id}` })) };
      }
      case 'get_document': {
        const document = await this.prisma.document.findFirst({ where: { id: input.documentId as string, workspaceId }, select: { id: true, title: true, content: true, updatedAt: true } });
        if (!document) throw new NotFoundException('That document was not found in this workspace.');
        return { text: JSON.stringify({ title: document.title, updated: isoDay(document.updatedAt), text: clip(documentText(document.content), 8000) }), sources: [{ type: 'document', id: document.id, title: document.title, href: `/workspace/documents/${document.id}` }] };
      }
      case 'get_briefing': {
        const briefing = await this.intelligence.briefing(identity, workspaceId);
        return { text: JSON.stringify({ summary: briefing.summary, insights: briefing.insights.map((insight) => ({ title: insight.title, detail: insight.detail })), eventsNext7Days: briefing.events.slice(0, 10).map((event) => ({ title: event.title, startsAt: event.startsAt })), focusTasks: briefing.focusTasks.map((task) => ({ id: task.id, title: task.title, status: task.status, priority: task.priority, due: isoDay(task.dueAt) })) }), sources: briefing.focusTasks.map((task) => ({ type: 'task' as const, id: task.id, title: task.title, href: `/workspace/tasks/${task.id}` })) };
      }
      default: throw new BadRequestException(`Unknown tool “${name}”.`);
    }
  }

  // ---- confirming proposed actions -------------------------------------------------------------------------

  async decide(identity: AuthenticatedIdentity, workspaceId: string, conversationId: string, actionId: string, body: unknown) {
    const decision = parseDecision(body);
    const userId = await requireWorkspaceMember(this.prisma, identity, workspaceId, decision === 'confirm');
    await this.own(userId, workspaceId, conversationId);
    const claimed = await this.updateAction(conversationId, actionId, (action) => {
      if (action.status !== 'pending') throw new ConflictException('This proposal has already been handled.');
      return { ...action, status: decision === 'confirm' ? 'confirmed' : 'declined' };
    });
    if (decision === 'decline') return claimed;
    try {
      const result = await this.execute(identity, workspaceId, claimed);
      return await this.updateAction(conversationId, actionId, (action) => ({ ...action, result }));
    } catch (error) {
      const message = error instanceof HttpException ? error.message : 'The task could not be created.';
      return await this.updateAction(conversationId, actionId, (action) => ({ ...action, status: 'failed', error: message }));
    }
  }

  /** Carries out a confirmed proposal as the member, through the same services (and permission checks) as the app itself. */
  private async execute(identity: AuthenticatedIdentity, workspaceId: string, action: PendingAction): Promise<{ id: string; title: string; href: string }> {
    const input = action.input;
    switch (action.tool) {
      case 'create_task': { const task = await this.productivity.createTask(identity, workspaceId, input) as { id: string; title: string }; return { id: task.id, title: task.title, href: `/workspace/tasks/${task.id}` }; }
      case 'update_task': { const { taskId, ...changes } = input; const task = await this.productivity.updateTask(identity, workspaceId, taskId as string, changes) as { id: string; title: string }; return { id: task.id, title: task.title, href: `/workspace/tasks/${task.id}` }; }
      case 'create_document': { const document = await this.productivity.createDocument(identity, workspaceId, { title: input.title, projectId: input.projectId, content: toDocumentContent(input.blocks as Array<{ type: string; text: string }>) }) as { id: string; title: string }; return { id: document.id, title: document.title, href: `/workspace/documents/${document.id}` }; }
      case 'create_event': { const event = await this.productivity.createCalendarEvent(identity, workspaceId, input) as { id: string; title: string }; return { id: event.id, title: event.title, href: '/workspace/calendar' }; }
      default: throw new BadRequestException('That kind of proposal is not supported.');
    }
  }

  /** Rewrites one action on its message under a row lock, so two clicks cannot both claim it. */
  private async updateAction(conversationId: string, actionId: string, change: (action: PendingAction) => PendingAction): Promise<PendingAction> {
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ id: string; pendingActions: PendingAction[] }>>`SELECT id, "pendingActions" FROM ai_messages WHERE "conversationId" = ${conversationId}::uuid AND "pendingActions" @> ${JSON.stringify([{ id: actionId }])}::jsonb FOR UPDATE`;
      const row = rows[0];
      const action = row?.pendingActions.find((item) => item.id === actionId);
      if (!row || !action) throw new NotFoundException('That proposal was not found.');
      const next = change(action);
      await transaction.aiMessage.update({ where: { id: row.id }, data: { pendingActions: row.pendingActions.map((item) => (item.id === actionId ? next : item)) as unknown as Prisma.InputJsonValue } });
      return next;
    });
  }
}

/** The tool definitions an agent may use. Guests never get write tools, whatever the agent allows. */
function allToolsFor(allowed: string[], canWrite: boolean) {
  return allTools.filter((tool) => allowed.includes(tool.name) && (canWrite || !isWriteTool(tool.name)));
}
