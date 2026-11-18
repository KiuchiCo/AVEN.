import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { ProductivityService } from './productivity.service.js';

@Controller('workspaces/:workspaceId/tasks')
@UseGuards(ClerkAuthGuard)
export class TasksController {
  constructor(private readonly productivity: ProductivityService) {}

  @Get()
  list(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.productivity.listTasks(identity, workspaceId);
  }

  @Patch('bulk')
  bulkUpdate(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Body() body: unknown) {
    return this.productivity.bulkUpdateTasks(identity, workspaceId, body);
  }

  @Post('import')
  importTasks(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Body() body: unknown) {
    return this.productivity.importTasks(identity, workspaceId, body);
  }

  @Post()
  create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.productivity.createTask(identity, workspaceId, body);
  }

  @Patch(':taskId')
  update(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body() body: unknown,
  ) {
    return this.productivity.updateTask(identity, workspaceId, taskId, body);
  }

  @Put(':taskId/dependencies')
  setDependencies(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body() body: unknown,
  ) {
    return this.productivity.setTaskDependencies(identity, workspaceId, taskId, body);
  }
}
