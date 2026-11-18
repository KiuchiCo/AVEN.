import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { DatabasesService } from './databases.service.js';

@Controller('workspaces/:workspaceId/databases')
@UseGuards(ClerkAuthGuard)
export class DatabasesController {
  constructor(private readonly databases: DatabasesService) {}

  @Get()
  list(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.databases.list(identity, workspaceId);
  }

  @Post()
  create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.databases.create(identity, workspaceId, body);
  }

  @Post(':databaseId/records')
  createRecord(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('databaseId', new ParseUUIDPipe()) databaseId: string,
    @Body() body: unknown,
  ) {
    return this.databases.createRecord(identity, workspaceId, databaseId, body);
  }

  @Post(':databaseId/records/:recordId/duplicate')
  duplicateRecord(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('databaseId', new ParseUUIDPipe()) databaseId: string,
    @Param('recordId', new ParseUUIDPipe()) recordId: string,
  ) {
    return this.databases.duplicateRecord(identity, workspaceId, databaseId, recordId);
  }

  @Post(':databaseId/records/import')
  importRecords(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('databaseId', new ParseUUIDPipe()) databaseId: string,
    @Body() body: unknown,
  ) {
    return this.databases.importRecords(identity, workspaceId, databaseId, body);
  }

  @Patch(':databaseId/properties')
  addProperty(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('databaseId', new ParseUUIDPipe()) databaseId: string,
    @Body() body: unknown,
  ) {
    return this.databases.addProperty(identity, workspaceId, databaseId, body);
  }

  @Post(':databaseId/views')
  saveView(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('databaseId', new ParseUUIDPipe()) databaseId: string,
    @Body() body: unknown,
  ) {
    return this.databases.saveView(identity, workspaceId, databaseId, body);
  }

  @Delete(':databaseId/views/:viewId')
  deleteView(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('databaseId', new ParseUUIDPipe()) databaseId: string,
    @Param('viewId', new ParseUUIDPipe()) viewId: string,
  ) {
    return this.databases.deleteView(identity, workspaceId, databaseId, viewId);
  }

  @Patch(':databaseId/records/:recordId')
  updateRecord(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('databaseId', new ParseUUIDPipe()) databaseId: string,
    @Param('recordId', new ParseUUIDPipe()) recordId: string,
    @Body() body: unknown,
  ) {
    return this.databases.updateRecord(identity, workspaceId, databaseId, recordId, body);
  }

  @Delete(':databaseId/records/:recordId')
  deleteRecord(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('databaseId', new ParseUUIDPipe()) databaseId: string,
    @Param('recordId', new ParseUUIDPipe()) recordId: string,
  ) {
    return this.databases.deleteRecord(identity, workspaceId, databaseId, recordId);
  }
}
