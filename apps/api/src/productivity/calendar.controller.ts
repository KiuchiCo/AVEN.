import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { ProductivityService } from './productivity.service.js';

@Controller('workspaces/:workspaceId/events')
@UseGuards(ClerkAuthGuard)
export class CalendarController {
  constructor(private readonly productivity: ProductivityService) {}

  @Get()
  list(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.productivity.listCalendarEvents(identity, workspaceId);
  }

  /** A cheap marker that changes whenever an event is added, edited or removed (by anyone, or by a calendar sync). The calendar page polls it to know when to reload the events. */
  @Get('revision')
  revision(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.productivity.calendarRevision(identity, workspaceId);
  }

  @Post()
  create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.productivity.createCalendarEvent(identity, workspaceId, body);
  }

  @Post('import')
  importEvents(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Body() body: unknown) {
    return this.productivity.importCalendarEvents(identity, workspaceId, body);
  }

  @Patch(':eventId')
  update(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('eventId', new ParseUUIDPipe()) eventId: string, @Body() body: unknown) {
    return this.productivity.updateCalendarEvent(identity, workspaceId, eventId, body);
  }

  @Delete(':eventId')
  remove(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('eventId', new ParseUUIDPipe()) eventId: string) {
    return this.productivity.deleteCalendarEvent(identity, workspaceId, eventId);
  }
}
