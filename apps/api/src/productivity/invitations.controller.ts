import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { WorkspaceInvitationsService } from './workspace-invitations.service.js';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: WorkspaceInvitationsService) {}

  @Get(':token')
  details(@Param('token') token: string) { return this.invitations.details(token); }

  @Post(':token/accept')
  @UseGuards(ClerkAuthGuard)
  accept(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('token') token: string) {
    return this.invitations.accept(identity, token);
  }
}
