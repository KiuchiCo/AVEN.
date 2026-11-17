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

@Module({
  controllers: [ProjectsController, TasksController, DocumentsController, CalendarController, DatabasesController, MilestonesController, SearchController, MembersController, ActivityController],
  providers: [ProductivityService, DatabasesService, ClerkAuthGuard],
})
export class ProductivityModule {}
