import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { ProductivityService } from './productivity.service.js';

@Controller('workspaces/:workspaceId/activity')
@UseGuards(ClerkAuthGuard)
export class ActivityController {
  constructor(private readonly productivity: ProductivityService) {}

  @Get()
  list(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.productivity.listWorkspaceActivity(identity, workspaceId);
  }

  @Get('inbox')
  inbox(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.productivity.listWorkspaceNotifications(identity, workspaceId);
  }

  @Patch(':activityId/read')
  markRead(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('activityId', new ParseUUIDPipe()) activityId: string, @Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof (body as { read?: unknown }).read !== 'boolean') throw new BadRequestException('read must be a boolean.');
    return this.productivity.markWorkspaceActivityRead(identity, workspaceId, activityId, (body as { read: boolean }).read);
  }

  @Post(':activityId/dismiss')
  dismiss(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('activityId', new ParseUUIDPipe()) activityId: string) {
    return this.productivity.dismissWorkspaceActivity(identity, workspaceId, activityId);
  }

  @Post('read-all')
  markAllRead(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.productivity.markAllWorkspaceActivityRead(identity, workspaceId);
  }
}
