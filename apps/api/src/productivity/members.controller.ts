import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { ProductivityService } from './productivity.service.js';
import { WorkspaceInvitationsService } from './workspace-invitations.service.js';

@Controller('workspaces/:workspaceId/members')
@UseGuards(ClerkAuthGuard, new RateLimitGuard(120))
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

  @Post('leave')
  leave(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.invitations.leave(identity, workspaceId);
  }

  @Post(':memberId/make-owner')
  makeOwner(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('memberId', new ParseUUIDPipe()) memberId: string) {
    return this.invitations.transferOwnership(identity, workspaceId, memberId);
  }

  @Patch(':memberId')
  updateMember(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('memberId', new ParseUUIDPipe()) memberId: string, @Body() body: unknown) {
    return this.invitations.updateMember(identity, workspaceId, memberId, body);
  }

  @Delete(':memberId')
  removeMember(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('memberId', new ParseUUIDPipe()) memberId: string) {
    return this.invitations.removeMember(identity, workspaceId, memberId);
  }

  @Delete('invitations/:inviteId')
  revoke(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('inviteId', new ParseUUIDPipe()) inviteId: string) {
    return this.invitations.revoke(identity, workspaceId, inviteId);
  }
}
