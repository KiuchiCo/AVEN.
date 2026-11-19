import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { ChannelEvents } from './channel-events.js';
import { MessagingController } from './messaging.controller.js';
import { MessagingService } from './messaging.service.js';

@Module({ controllers: [MessagingController], providers: [MessagingService, ChannelEvents, ClerkAuthGuard] })
export class MessagingModule {}
