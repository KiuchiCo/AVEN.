import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { ProjectsController } from './projects.controller.js';
import { TasksController } from './tasks.controller.js';
import { ProductivityService } from './productivity.service.js';

@Module({
  controllers: [ProjectsController, TasksController],
  providers: [ProductivityService, ClerkAuthGuard],
})
export class ProductivityModule {}
