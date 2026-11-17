import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { IntelligenceService } from './intelligence.service.js';

@Controller('workspaces/:workspaceId/intelligence')
@UseGuards(ClerkAuthGuard)
export class IntelligenceController {
  constructor(private readonly intelligence: IntelligenceService) {}

  @Get('briefing')
  briefing(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.intelligence.briefing(identity, workspaceId);
  }
}
