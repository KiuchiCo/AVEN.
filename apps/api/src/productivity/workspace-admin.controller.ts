import { Body, Controller, Delete, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { WorkspaceInvitationsService } from './workspace-invitations.service.js';

@Controller('workspaces/:workspaceId')
@UseGuards(ClerkAuthGuard)
export class WorkspaceAdminController {
  constructor(private readonly invitations: WorkspaceInvitationsService) {}

  /** Permanently deletes this workspace. The body must carry the workspace's exact name. */
  @Delete()
  remove(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Body() body: unknown) {
    return this.invitations.deleteWorkspace(identity, workspaceId, body);
  }
}
