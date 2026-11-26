import { reportJobFailure } from '../observability/error-reporter.js';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { readApiEnvironment } from '../config/api-environment.js';
import { CalendarSyncService } from './calendar-sync.service.js';

/**
 * Checks every minute for connected calendars that are due (about five minutes since their last sync), and once shortly after the server starts,
 * so a restart doesn't leave a calendar waiting. Turn it off with CALENDAR_SYNC_DISABLED=true on any server that shouldn't.
 * When Google push notifications are added later, a notification should call CalendarSyncService.syncConnection for that account; this check can stay as the backstop.
 */
@Injectable()
export class CalendarSyncRunner implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout; private first?: NodeJS.Timeout; private running = false;
  private readonly logger = new Logger('CalendarSync');
  constructor(private readonly sync: CalendarSyncService) {}

  onModuleInit() {
    if (readApiEnvironment().calendar.syncDisabled) return;
    this.timer = setInterval(() => { void this.tick(); }, 60_000); this.timer.unref();
    this.first = setTimeout(() => { void this.tick(); }, 20_000); this.first.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); if (this.first) clearTimeout(this.first); }
  async tick() {
    if (this.running) return; this.running = true;
    try { await this.sync.syncDue(); } catch (error) { reportJobFailure('calendar-sync', error); this.logger.error(`Calendar sync run failed: ${error instanceof Error ? error.message : error}`); }
    finally { this.running = false; }
  }
}
