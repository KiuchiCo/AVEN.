import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { WhiteboardsController } from './whiteboards.controller.js';
import { WhiteboardsService } from './whiteboards.service.js';

@Module({ controllers: [WhiteboardsController], providers: [WhiteboardsService, ClerkAuthGuard] })
export class WhiteboardsModule {}
