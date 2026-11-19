import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { CalendarCallbackController, CalendarSyncController } from './calendar-sync.controller.js';
import { CalendarSyncRunner } from './calendar-sync.runner.js';
import { CALENDAR_PROVIDERS, CalendarSyncService } from './calendar-sync.service.js';
import { GoogleCalendar, MicrosoftCalendar, type CalendarProvider } from './providers.js';

@Module({
  controllers: [CalendarSyncController, CalendarCallbackController],
  providers: [
    CalendarSyncService, CalendarSyncRunner, ClerkAuthGuard,
    // To add another calendar service, add a class with the CalendarProvider methods here.
    { provide: CALENDAR_PROVIDERS, useFactory: (): CalendarProvider[] => { const { calendar } = readApiEnvironment(); return [...(calendar.google ? [new GoogleCalendar(calendar.google)] : []), ...(calendar.microsoft ? [new MicrosoftCalendar(calendar.microsoft)] : [])]; } },
  ],
  exports: [CalendarSyncService],
})
export class CalendarSyncModule {}
