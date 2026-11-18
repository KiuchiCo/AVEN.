import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../../auth/auth.types.js';
import { TaskChecklistService } from './task-checklist.service.js';
import { TaskCommentsService } from './task-comments.service.js';
import { TaskFollowersService } from './task-followers.service.js';
import { objectBody } from './task-collaboration.input.js';
import { TaskDetailService } from './task-detail.service.js';

@Controller('workspaces/:workspaceId/tasks/:taskId/collaboration')
@UseGuards(ClerkAuthGuard)
export class TaskCollaborationController {
  constructor(private readonly comments: TaskCommentsService, private readonly checklist: TaskChecklistService, private readonly followers: TaskFollowersService, private readonly taskDetail: TaskDetailService) {}
  @Get('task') task(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('taskId', new ParseUUIDPipe()) taskId: string) { return this.taskDetail.get(identity, workspaceId, taskId); }
  @Get('comments') commentsList(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('taskId', new ParseUUIDPipe()) taskId: string) { return this.comments.list(identity, workspaceId, taskId); }
  @Post('comments') commentCreate(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('taskId', new ParseUUIDPipe()) taskId: string, @Body() body: unknown) { return this.comments.create(identity, workspaceId, taskId, body); }
  @Patch('comments/:commentId') commentUpdate(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('taskId', new ParseUUIDPipe()) taskId: string, @Param('commentId', new ParseUUIDPipe()) commentId: string, @Body() body: unknown) { return this.comments.update(identity, workspaceId, taskId, commentId, body); }
  @Delete('comments/:commentId') commentRemove(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('taskId', new ParseUUIDPipe()) taskId: string, @Param('commentId', new ParseUUIDPipe()) commentId: string) { return this.comments.remove(identity, workspaceId, taskId, commentId); }
  @Get('checklist') checklistList(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('taskId', new ParseUUIDPipe()) taskId: string) { return this.checklist.list(identity, workspaceId, taskId); }
  @Post('checklist') checklistCreate(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('taskId', new ParseUUIDPipe()) taskId: string, @Body() body: unknown) { return this.checklist.create(identity, workspaceId, taskId, body); }
  @Patch('checklist/:itemId') checklistUpdate(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('taskId', new ParseUUIDPipe()) taskId: string, @Param('itemId', new ParseUUIDPipe()) itemId: string, @Body() body: unknown) { return this.checklist.update(identity, workspaceId, taskId, itemId, body); }
  @Delete('checklist/:itemId') checklistRemove(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('taskId', new ParseUUIDPipe()) taskId: string, @Param('itemId', new ParseUUIDPipe()) itemId: string) { return this.checklist.remove(identity, workspaceId, taskId, itemId); }
  @Post('checklist/:itemId/move') checklistMove(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('taskId', new ParseUUIDPipe()) taskId: string, @Param('itemId', new ParseUUIDPipe()) itemId: string, @Body() body: unknown) { const direction = objectBody(body).direction; if (direction !== 'UP' && direction !== 'DOWN') throw new BadRequestException('Direction must be UP or DOWN.'); return this.checklist.move(identity, workspaceId, taskId, itemId, direction); }
  @Get('watchers') watcherList(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('taskId', new ParseUUIDPipe()) taskId: string) { return this.followers.list(identity, workspaceId, taskId); }
  @Put('watching') setWatching(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('taskId', new ParseUUIDPipe()) taskId: string, @Body() body: unknown) { return this.followers.setFollowing(identity, workspaceId, taskId, objectBody(body).following as boolean); }
}
