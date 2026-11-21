import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { SemanticService } from './semantic.service.js';

@Controller('workspaces/:workspaceId/search/semantic')
@UseGuards(ClerkAuthGuard, RateLimitGuard.strict(60))
export class SemanticController {
  constructor(private readonly semantic: SemanticService) {}

  @Get('status')
  status(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.semantic.status(identity, workspaceId);
  }

  @Get()
  search(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Query('q') query: string) {
    return this.semantic.search(identity, workspaceId, query);
  }
}
