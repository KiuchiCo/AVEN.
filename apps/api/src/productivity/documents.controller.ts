import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { ProductivityService } from './productivity.service.js';

@Controller('workspaces/:workspaceId/documents')
@UseGuards(ClerkAuthGuard)
export class DocumentsController {
  constructor(private readonly productivity: ProductivityService) {}

  @Get()
  list(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.productivity.listDocuments(identity, workspaceId);
  }

  @Get(':documentId')
  get(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    return this.productivity.getDocument(identity, workspaceId, documentId);
  }

  @Post()
  create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.productivity.createDocument(identity, workspaceId, body);
  }

  @Delete(':documentId')
  remove(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    return this.productivity.deleteDocument(identity, workspaceId, documentId);
  }

  @Patch(':documentId')
  update(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body() body: unknown,
  ) {
    return this.productivity.updateDocument(identity, workspaceId, documentId, body);
  }

  @Get(':documentId/versions')
  versions(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    return this.productivity.listDocumentVersions(identity, workspaceId, documentId);
  }

  @Post(':documentId/versions')
  createVersion(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body() body: unknown,
  ) {
    return this.productivity.createDocumentVersion(identity, workspaceId, documentId, body);
  }

  @Post(':documentId/versions/:versionId/restore')
  restoreVersion(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
  ) {
    return this.productivity.restoreDocumentVersion(identity, workspaceId, documentId, versionId);
  }

  @Get(':documentId/comments')
  comments(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    return this.productivity.listDocumentComments(identity, workspaceId, documentId);
  }

  @Post(':documentId/comments')
  createComment(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body() body: unknown,
  ) {
    return this.productivity.createDocumentComment(identity, workspaceId, documentId, body);
  }

  @Patch(':documentId/comments/:commentId')
  resolveComment(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Body() body: unknown,
  ) {
    return this.productivity.resolveDocumentComment(identity, workspaceId, documentId, commentId, body);
  }
}
