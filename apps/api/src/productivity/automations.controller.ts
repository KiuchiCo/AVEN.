import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { AutomationsService } from './automations.service.js';

@Controller('workspaces/:workspaceId/automations')
@UseGuards(ClerkAuthGuard)
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  list(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.automations.list(identity, workspaceId);
  }

  @Post()
  create(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Body() body: unknown) {
    return this.automations.create(identity, workspaceId, body);
  }

  @Patch(':ruleId')
  update(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('ruleId', new ParseUUIDPipe()) ruleId: string, @Body() body: unknown) {
    return this.automations.update(identity, workspaceId, ruleId, body);
  }

  @Delete(':ruleId')
  remove(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('ruleId', new ParseUUIDPipe()) ruleId: string) {
    return this.automations.remove(identity, workspaceId, ruleId);
  }
}
