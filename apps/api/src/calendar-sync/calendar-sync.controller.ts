import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
import type { Response } from 'express';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { CalendarSyncService } from './calendar-sync.service.js';

type Who = AuthenticatedIdentity;
const workspace = () => Param('workspaceId', new ParseUUIDPipe());
const connection = () => Param('connectionId', new ParseUUIDPipe());

@Controller('workspaces/:workspaceId/integrations/calendar')
@UseGuards(ClerkAuthGuard, RateLimitGuard.strict(60))
export class CalendarSyncController {
  constructor(private readonly sync: CalendarSyncService) {}
  @Get() overview(@CurrentIdentity() who: Who, @workspace() ws: string) { return this.sync.overview(who, ws); }
  @Post('connect') @HttpCode(200) connect(@CurrentIdentity() who: Who, @workspace() ws: string, @Body() body: unknown) { return this.sync.connect(who, ws, body); }
  @Patch(':connectionId') setPush(@CurrentIdentity() who: Who, @workspace() ws: string, @connection() id: string, @Body() body: unknown) { return this.sync.setPush(who, ws, id, body); }
  @Post(':connectionId/sync') @HttpCode(200) syncNow(@CurrentIdentity() who: Who, @workspace() ws: string, @connection() id: string) { return this.sync.syncNow(who, ws, id); }
  @Delete(':connectionId') disconnect(@CurrentIdentity() who: Who, @workspace() ws: string, @connection() id: string) { return this.sync.disconnect(who, ws, id); }
}

/** The provider sends the person's browser here after they approve access. It is public: the signed `state` is what proves who started it. */
@Controller('integrations/calendar')
export class CalendarCallbackController {
  constructor(private readonly sync: CalendarSyncService) {}
  @Get('callback')
  async callback(@Query() query: { code?: string; state?: string; error?: string }, @Res() response: Response) {
    response.redirect(302, await this.sync.callback(query));
  }
}
