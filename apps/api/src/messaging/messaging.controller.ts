import { Body, Controller, Delete, Get, HttpException, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { ChannelEvents } from './channel-events.js';
import { MessagingService } from './messaging.service.js';

type Who = AuthenticatedIdentity;
const workspace = () => Param('workspaceId', new ParseUUIDPipe());
const channel = () => Param('channelId', new ParseUUIDPipe());

@Controller('workspaces/:workspaceId/channels')
@UseGuards(ClerkAuthGuard)
export class MessagingController {
  constructor(private readonly messaging: MessagingService, private readonly events: ChannelEvents) {}

  /** Server-sent events: new messages, edits, deletions and new channels for everyone in the workspace. */
  @Get('stream')
  async stream(@CurrentIdentity() who: Who, @workspace() ws: string, @Req() request: Request, @Res() response: Response) {
    const userId = await this.messaging.openStream(who, ws);
    const release = this.events.acquire(userId);
    if (!release) throw new HttpException('Too many live connections are open for your account. Close some tabs and try again.', 429);
    response.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    response.flushHeaders();
    response.write(': connected\n\n');
    const unsubscribe = this.events.subscribe(ws, (event) => { if (!response.writableEnded) response.write(`data: ${JSON.stringify(event)}\n\n`); });
    const heartbeat = setInterval(() => { if (!response.writableEnded) response.write(': keep-alive\n\n'); }, 25_000);
    request.on('close', () => { clearInterval(heartbeat); unsubscribe(); release(); });
  }

  @Get() list(@CurrentIdentity() who: Who, @workspace() ws: string) { return this.messaging.list(who, ws); }
  @Post() create(@CurrentIdentity() who: Who, @workspace() ws: string, @Body() body: unknown) { return this.messaging.createChannel(who, ws, body); }
  @Get(':channelId/messages') messages(@CurrentIdentity() who: Who, @workspace() ws: string, @channel() id: string, @Query() query: { before?: string }) { return this.messaging.messages(who, ws, id, query); }
  @Post(':channelId/messages') send(@CurrentIdentity() who: Who, @workspace() ws: string, @channel() id: string, @Body() body: unknown) { return this.messaging.send(who, ws, id, body); }
  @Patch(':channelId/messages/:messageId') edit(@CurrentIdentity() who: Who, @workspace() ws: string, @channel() id: string, @Param('messageId', new ParseUUIDPipe()) messageId: string, @Body() body: unknown) { return this.messaging.edit(who, ws, id, messageId, body); }
  @Delete(':channelId/messages/:messageId') remove(@CurrentIdentity() who: Who, @workspace() ws: string, @channel() id: string, @Param('messageId', new ParseUUIDPipe()) messageId: string) { return this.messaging.remove(who, ws, id, messageId); }
  @Post(':channelId/read') read(@CurrentIdentity() who: Who, @workspace() ws: string, @channel() id: string) { return this.messaging.read(who, ws, id); }
}
