import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { WhiteboardsService } from './whiteboards.service.js';

type Who = AuthenticatedIdentity;
const workspace = () => Param('workspaceId', new ParseUUIDPipe());
const board = () => Param('whiteboardId', new ParseUUIDPipe());

@Controller('workspaces/:workspaceId/whiteboards')
@UseGuards(ClerkAuthGuard)
export class WhiteboardsController {
  constructor(private readonly boards: WhiteboardsService) {}

  @Get() list(@CurrentIdentity() who: Who, @workspace() ws: string) { return this.boards.list(who, ws); }
  @Post() create(@CurrentIdentity() who: Who, @workspace() ws: string, @Body() input: unknown) { return this.boards.create(who, ws, input); }
  @Get(':whiteboardId') get(@CurrentIdentity() who: Who, @workspace() ws: string, @board() id: string) { return this.boards.get(who, ws, id); }
  @Patch(':whiteboardId') update(@CurrentIdentity() who: Who, @workspace() ws: string, @board() id: string, @Body() input: unknown) { return this.boards.update(who, ws, id, input); }
  @Delete(':whiteboardId') remove(@CurrentIdentity() who: Who, @workspace() ws: string, @board() id: string) { return this.boards.remove(who, ws, id); }
}
