import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { KnowledgeService } from './knowledge.service.js';

@Controller('workspaces/:workspaceId/knowledge')
@UseGuards(ClerkAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  list(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Query('q') query?: string, @Query('archived') archived?: string) {
    return this.knowledge.list(identity, workspaceId, { q: query, archived });
  }

  @Post()
  create(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Body() body: unknown) {
    return this.knowledge.create(identity, workspaceId, body);
  }

  @Patch(':itemId')
  update(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('itemId', new ParseUUIDPipe()) itemId: string, @Body() body: unknown) {
    return this.knowledge.update(identity, workspaceId, itemId, body);
  }

  @Post(':itemId/archive')
  archive(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('itemId', new ParseUUIDPipe()) itemId: string, @Body() body: unknown) {
    const archived = body && typeof body === 'object' && !Array.isArray(body) ? (body as { archived?: unknown }).archived : undefined;
    if (typeof archived !== 'boolean') return this.knowledge.archive(identity, workspaceId, itemId, true);
    return this.knowledge.archive(identity, workspaceId, itemId, archived);
  }
}
