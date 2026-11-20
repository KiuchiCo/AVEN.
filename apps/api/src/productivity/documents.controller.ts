import { Body, Controller, Delete, Get, HttpException, Param, ParseUUIDPipe, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DocumentEvents } from './document-events.js';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { ProductivityService } from './productivity.service.js';

@Controller('workspaces/:workspaceId/documents')
@UseGuards(ClerkAuthGuard)
export class DocumentsController {
  constructor(private readonly productivity: ProductivityService, private readonly events: DocumentEvents) {}

  /** Server-sent events for one open document: who else is here, and when someone saves a newer version. */
  @Get(':documentId/stream')
  async stream(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const viewer = await this.productivity.openDocumentStream(identity, workspaceId, documentId);
    const release = this.events.acquire(viewer.id);
    if (!release) throw new HttpException('Too many live connections are open for your account. Close some tabs and try again.', 429);
    response.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    response.flushHeaders();
    response.write(': connected\n\n');
    const unsubscribe = this.events.subscribe(documentId, viewer, (event) => { if (!response.writableEnded) response.write(`data: ${JSON.stringify(event)}\n\n`); });
    const heartbeat = setInterval(() => { if (!response.writableEnded) response.write(': keep-alive\n\n'); }, 25_000);
    request.on('close', () => { clearInterval(heartbeat); unsubscribe(); release(); });
  }

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
