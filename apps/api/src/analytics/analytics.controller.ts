import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('workspaces/:workspaceId/analytics')
@UseGuards(ClerkAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}
  @Get() overview(@CurrentIdentity() who: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Query() query: { days?: string }) { return this.analytics.overview(who, workspaceId, query); }
}
