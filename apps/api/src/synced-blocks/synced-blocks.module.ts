import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { SyncedBlocksController } from './synced-blocks.controller.js';
import { SyncedBlocksService } from './synced-blocks.service.js';

@Module({ controllers: [SyncedBlocksController], providers: [SyncedBlocksService, ClerkAuthGuard] })
export class SyncedBlocksModule {}
