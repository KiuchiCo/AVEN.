import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { ProductivityService } from './productivity.service.js';

@Controller('workspaces/:workspaceId/tasks')
@UseGuards(ClerkAuthGuard)
export class TasksController {
  constructor(private readonly productivity: ProductivityService) {}

  @Get('labels')
  labels(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.productivity.listTaskLabels(identity, workspaceId);
  }

  @Patch('labels')
  renameLabel(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Body() body: unknown) {
    return this.productivity.renameTaskLabel(identity, workspaceId, body);
  }

  @Delete('labels/:label')
  deleteLabel(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('label') label: string) {
    return this.productivity.deleteTaskLabel(identity, workspaceId, label);
  }

  @Get('views')
  views(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.productivity.listTaskViews(identity, workspaceId);
  }

  @Post('views')
  createView(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Body() body: unknown) {
    return this.productivity.createTaskView(identity, workspaceId, body);
  }

  @Patch('views/:viewId')
  updateView(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('viewId', new ParseUUIDPipe()) viewId: string, @Body() body: unknown) {
    return this.productivity.updateTaskView(identity, workspaceId, viewId, body);
  }

  @Delete('views/:viewId')
  removeView(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('viewId', new ParseUUIDPipe()) viewId: string) {
    return this.productivity.deleteTaskView(identity, workspaceId, viewId);
  }

  @Get()
  list(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Query('label') label?: string) {
    return this.productivity.listTasks(identity, workspaceId, label);
  }

  @Patch('bulk')
  bulkUpdate(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Body() body: unknown) {
    return this.productivity.bulkUpdateTasks(identity, workspaceId, body);
  }

  @Post('bulk/duplicate')
  bulkDuplicate(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Body() body: unknown) {
    return this.productivity.bulkDuplicateTasks(identity, workspaceId, body);
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

  @Post(':taskId/duplicate')
  duplicate(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
  ) {
    return this.productivity.duplicateTask(identity, workspaceId, taskId);
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
