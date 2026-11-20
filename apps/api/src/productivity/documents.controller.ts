import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpException, Param, ParseUUIDPipe, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DocumentEvents } from './document-events.js';
import { TextSessions } from './text-sessions.js';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { ProductivityService } from './productivity.service.js';

@Controller('workspaces/:workspaceId/documents')
@UseGuards(ClerkAuthGuard)
export class DocumentsController {
  constructor(private readonly productivity: ProductivityService, private readonly events: DocumentEvents, private readonly textSessions: TextSessions) {}

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

  /** The live text of one block and the revision to write edits against. */
  @Get(':documentId/text/:blockId')
  liveText(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Param('blockId') blockId: string,
  ) {
    return this.textSessions.text(identity, workspaceId, documentId, blockId);
  }

  /** One keystroke-level edit to a block's text, written against a revision. */
  @Post(':documentId/text/:blockId/ops')
  liveEdit(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Param('blockId') blockId: string,
    @Body() body: unknown,
  ) {
    return this.textSessions.receive(identity, workspaceId, documentId, blockId, body);
  }

  /** Shares the caret position in a block's text with the others who have the document open. */
  @Post(':documentId/text/:blockId/cursor')
  @HttpCode(204)
  async shareCursor(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Param('blockId') blockId: string,
    @Body() body: unknown,
  ) {
    await this.textSessions.cursor(identity, workspaceId, documentId, blockId, body);
  }

  /** Retires an edit source so nothing more is accepted from it; used before a client re-reads a block after losing track of its last edit. */
  @Post(':documentId/text/:blockId/fence')
  @HttpCode(204)
  async fenceEdits(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Param('blockId') blockId: string,
    @Body() body: unknown,
  ) {
    await this.textSessions.fence(identity, workspaceId, documentId, blockId, body);
  }

  /** Says which block the caller's cursor is in (or null when it left), for the "someone is editing here" markers. */
  @Post(':documentId/focus')
  @HttpCode(204)
  async focus(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body() body: { blockId?: unknown },
  ) {
    const blockId = body?.blockId ?? null;
    if (blockId !== null && (typeof blockId !== 'string' || !/^[\w-]{1,64}$/.test(blockId))) throw new BadRequestException('blockId must be a block id or null.');
    const viewer = await this.productivity.openDocumentStream(identity, workspaceId, documentId);
    this.events.setFocus(documentId, viewer.id, blockId);
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
