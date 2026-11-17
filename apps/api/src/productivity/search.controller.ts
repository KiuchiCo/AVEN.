import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { ProductivityService } from './productivity.service.js';

@Controller('workspaces/:workspaceId/search')
@UseGuards(ClerkAuthGuard)
export class SearchController {
  constructor(private readonly productivity: ProductivityService) {}

  @Get()
  search(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Query('q') query: string,
  ) {
    return this.productivity.searchWorkspace(identity, workspaceId, query);
  }
}
