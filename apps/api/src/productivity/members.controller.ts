import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { ProductivityService } from './productivity.service.js';
import { WorkspaceInvitationsService } from './workspace-invitations.service.js';

@Controller('workspaces/:workspaceId/members')
@UseGuards(ClerkAuthGuard)
export class MembersController {
  constructor(private readonly productivity: ProductivityService, private readonly invitations: WorkspaceInvitationsService) {}

  @Get()
  list(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.productivity.listWorkspaceMembers(identity, workspaceId);
  }

  @Get('management')
  management(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.invitations.list(identity, workspaceId);
  }

  @Post('invitations')
  invite(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Body() body: unknown) {
    return this.invitations.create(identity, workspaceId, body);
  }

  @Delete('invitations/:inviteId')
  revoke(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('inviteId', new ParseUUIDPipe()) inviteId: string) {
    return this.invitations.revoke(identity, workspaceId, inviteId);
  }
}
