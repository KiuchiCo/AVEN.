import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { ProductivityService } from './productivity.service.js';

@Controller('workspaces/:workspaceId/projects/:projectId/milestones')
@UseGuards(ClerkAuthGuard)
export class MilestonesController {
  constructor(private readonly productivity: ProductivityService) {}

  @Get()
  list(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.productivity.listProjectMilestones(identity, workspaceId, projectId);
  }

  @Post()
  create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() body: unknown,
  ) {
    return this.productivity.createProjectMilestone(identity, workspaceId, projectId, body);
  }

  @Patch(':milestoneId')
  update(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
    @Body() body: unknown,
  ) {
    return this.productivity.updateProjectMilestone(identity, workspaceId, projectId, milestoneId, body);
  }
}
