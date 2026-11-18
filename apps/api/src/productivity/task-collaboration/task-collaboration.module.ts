import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../../auth/clerk-auth.guard.js';
import { TaskChecklistService } from './task-checklist.service.js';
import { TaskCollaborationAccess } from './task-collaboration.access.js';
import { TaskCollaborationController } from './task-collaboration.controller.js';
import { TaskCollaborationNotifications } from './task-collaboration.notifications.js';
import { TaskCommentsService } from './task-comments.service.js';
import { TaskFollowersService } from './task-followers.service.js';
import { TaskDetailService } from './task-detail.service.js';
import { TaskMentionService } from './task-mention.service.js';
import { TaskChecklistOrderService } from './task-checklist-order.service.js';

@Module({ controllers: [TaskCollaborationController], providers: [TaskCollaborationAccess, TaskCollaborationNotifications, TaskCommentsService, TaskChecklistService, TaskFollowersService, TaskDetailService, TaskMentionService, TaskChecklistOrderService, ClerkAuthGuard], exports: [TaskCommentsService, TaskChecklistService, TaskFollowersService, TaskDetailService] })
export class TaskCollaborationModule {}
