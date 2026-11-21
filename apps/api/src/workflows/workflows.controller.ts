import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { WorkflowsService } from './workflows.service.js';

type Who = AuthenticatedIdentity;
const workspace = () => Param('workspaceId', new ParseUUIDPipe());
const workflow = () => Param('workflowId', new ParseUUIDPipe());

@Controller('workspaces/:workspaceId/workflows')
@UseGuards(ClerkAuthGuard, new RateLimitGuard(120))
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get() list(@CurrentIdentity() who: Who, @workspace() ws: string) { return this.workflows.list(who, ws); }
  @Post() create(@CurrentIdentity() who: Who, @workspace() ws: string, @Body() body: unknown) { return this.workflows.create(who, ws, body); }
  @Get(':workflowId') get(@CurrentIdentity() who: Who, @workspace() ws: string, @workflow() id: string) { return this.workflows.get(who, ws, id); }
  @Patch(':workflowId') update(@CurrentIdentity() who: Who, @workspace() ws: string, @workflow() id: string, @Body() body: unknown) { return this.workflows.update(who, ws, id, body); }
  @Delete(':workflowId') remove(@CurrentIdentity() who: Who, @workspace() ws: string, @workflow() id: string) { return this.workflows.remove(who, ws, id); }
  @Post(':workflowId/run') run(@CurrentIdentity() who: Who, @workspace() ws: string, @workflow() id: string, @Body() body: unknown) { return this.workflows.run(who, ws, id, body); }
  @Get(':workflowId/runs') runs(@CurrentIdentity() who: Who, @workspace() ws: string, @workflow() id: string) { return this.workflows.runs(who, ws, id); }
}
