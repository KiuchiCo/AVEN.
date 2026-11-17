import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { ProjectsController } from './projects.controller.js';
import { TasksController } from './tasks.controller.js';
import { ProductivityService } from './productivity.service.js';
import { DocumentsController } from './documents.controller.js';
import { CalendarController } from './calendar.controller.js';
import { DatabasesController } from './databases.controller.js';
import { DatabasesService } from './databases.service.js';
import { MilestonesController } from './milestones.controller.js';
import { SearchController } from './search.controller.js';
import { MembersController } from './members.controller.js';
import { ActivityController } from './activity.controller.js';
import { IntelligenceController } from './intelligence.controller.js';
import { IntelligenceService } from './intelligence.service.js';
import { InvitationsController } from './invitations.controller.js';
import { WorkspaceInvitationsService } from './workspace-invitations.service.js';
import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeService } from './knowledge.service.js';

@Module({
  controllers: [ProjectsController, TasksController, DocumentsController, CalendarController, DatabasesController, MilestonesController, SearchController, MembersController, ActivityController, IntelligenceController, InvitationsController, KnowledgeController],
  providers: [ProductivityService, DatabasesService, IntelligenceService, WorkspaceInvitationsService, KnowledgeService, ClerkAuthGuard],
})
export class ProductivityModule {}
