import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { AiService, type AiEvent } from './ai.service.js';
import { LlmError } from './llm.js';

const workspace = () => Param('workspaceId', new ParseUUIDPipe());
const conversation = () => Param('conversationId', new ParseUUIDPipe());

@Controller('workspaces/:workspaceId/ai')
@UseGuards(ClerkAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status') status(@CurrentIdentity() who: AuthenticatedIdentity, @workspace() ws: string) { return this.ai.status(who, ws); }
  @Get('conversations') list(@CurrentIdentity() who: AuthenticatedIdentity, @workspace() ws: string) { return this.ai.list(who, ws); }
  @Post('conversations') create(@CurrentIdentity() who: AuthenticatedIdentity, @workspace() ws: string) { return this.ai.create(who, ws); }
  @Get('conversations/:conversationId') get(@CurrentIdentity() who: AuthenticatedIdentity, @workspace() ws: string, @conversation() id: string) { return this.ai.get(who, ws, id); }
  @Delete('conversations/:conversationId') remove(@CurrentIdentity() who: AuthenticatedIdentity, @workspace() ws: string, @conversation() id: string) { return this.ai.remove(who, ws, id); }

  @Post('conversations/:conversationId/actions/:actionId')
  decide(@CurrentIdentity() who: AuthenticatedIdentity, @workspace() ws: string, @conversation() id: string, @Param('actionId', new ParseUUIDPipe()) actionId: string, @Body() body: unknown) { return this.ai.decide(who, ws, id, actionId, body); }

  /** Streams the answer as server-sent events. Anything that can fail up front (config, credits, validation) fails as a normal HTTP error first. */
  @Post('conversations/:conversationId/messages')
  async send(@CurrentIdentity() who: AuthenticatedIdentity, @workspace() ws: string, @conversation() id: string, @Body() body: unknown, @Res() response: Response) {
    const run = await this.ai.prepare(who, ws, id, body);
    response.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    response.flushHeaders();
    const abort = new AbortController();
    response.on('close', () => abort.abort());
    const emit = (event: AiEvent) => { if (!response.writableEnded) response.write(`data: ${JSON.stringify(event)}\n\n`); };
    try { await run(emit, abort.signal); }
    catch (error) { emit({ type: 'error', message: error instanceof LlmError ? error.message : 'Something went wrong while answering. Please try again.' }); }
    finally { response.end(); }
  }
}
