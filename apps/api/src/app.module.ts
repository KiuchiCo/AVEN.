import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module.js';
import { SemanticModule } from './semantic/semantic.module.js';
import { WorkflowsModule } from './workflows/workflows.module.js';
import { BillingModule } from './billing/billing.module.js';
import { WhiteboardsModule } from './whiteboards/whiteboards.module.js';
import { MessagingModule } from './messaging/messaging.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AuditModule } from './audit/audit.module.js';
import { CalendarSyncModule } from './calendar-sync/calendar-sync.module.js';
import { SharingModule } from './sharing/sharing.module.js';
import { ExportModule } from './export/export.module.js';
import { FavouritesModule } from './favourites/favourites.module.js';
import { SyncedBlocksModule } from './synced-blocks/synced-blocks.module.js';
import { PushModule } from './push/push.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './database/prisma.module.js';
import { EmailModule } from './email/email.module.js';
import { FilesModule } from './files/files.module.js';
import { HealthController } from './health.controller.js';
import { ProductivityModule } from './productivity/productivity.module.js';

@Module({
  imports: [PrismaModule, AuthModule, ProductivityModule, FilesModule, AiModule, SemanticModule, WorkflowsModule, EmailModule, BillingModule, WhiteboardsModule, MessagingModule, AnalyticsModule, AuditModule, CalendarSyncModule, SharingModule, ExportModule, FavouritesModule, SyncedBlocksModule, PushModule],
  controllers: [HealthController],
})
export class AppModule {}
