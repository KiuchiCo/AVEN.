import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

@Module({ controllers: [AnalyticsController], providers: [AnalyticsService, ClerkAuthGuard] })
export class AnalyticsModule {}
