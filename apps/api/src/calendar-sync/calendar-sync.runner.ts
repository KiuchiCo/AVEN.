import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { readApiEnvironment } from '../config/api-environment.js';
import { CalendarSyncService } from './calendar-sync.service.js';

/** Syncs connected calendars every five minutes. Turn it off with CALENDAR_SYNC_DISABLED=true on any server that shouldn't. */
@Injectable()
export class CalendarSyncRunner implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout; private running = false;
  private readonly logger = new Logger('CalendarSync');
  constructor(private readonly sync: CalendarSyncService) {}

  onModuleInit() {
    if (readApiEnvironment().calendar.syncDisabled) return;
    this.timer = setInterval(() => { void this.tick(); }, 5 * 60_000); this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async tick() {
    if (this.running) return; this.running = true;
    try { await this.sync.syncDue(); } catch (error) { this.logger.error(`Calendar sync run failed: ${error instanceof Error ? error.message : error}`); }
    finally { this.running = false; }
  }
}
