import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { ProductivityModule } from '../productivity/productivity.module.js';
import { WorkflowRunner } from './workflow-runner.service.js';
import { WorkflowsController } from './workflows.controller.js';
import { WorkflowsService } from './workflows.service.js';

@Module({ imports: [ProductivityModule, AiModule], controllers: [WorkflowsController], providers: [WorkflowsService, WorkflowRunner, ClerkAuthGuard] })
export class WorkflowsModule {}
