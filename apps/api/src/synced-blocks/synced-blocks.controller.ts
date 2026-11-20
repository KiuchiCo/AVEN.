import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { SyncedBlocksService } from './synced-blocks.service.js';

@Controller('workspaces/:workspaceId/synced-blocks')
@UseGuards(ClerkAuthGuard)
export class SyncedBlocksController {
  constructor(private readonly blocks: SyncedBlocksService) {}
  @Get(':id') read(@CurrentIdentity() who: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) ws: string, @Param('id') id: string) { return this.blocks.read(who, ws, id); }
  @Put(':id') @HttpCode(200) write(@CurrentIdentity() who: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) ws: string, @Param('id') id: string, @Body() body: unknown) { return this.blocks.write(who, ws, id, body); }
}
