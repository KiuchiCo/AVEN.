import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { FilesService } from './files.service.js';

type Identity = AuthenticatedIdentity;
const workspace = () => Param('workspaceId', new ParseUUIDPipe());

@Controller('workspaces/:workspaceId/files')
@UseGuards(ClerkAuthGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get() list(@CurrentIdentity() who: Identity, @workspace() ws: string, @Query('folderId') folderId?: string, @Query('q') q?: string, @Query('deleted') deleted?: string) { return this.files.list(who, ws, { folderId, q, deleted }); }
  @Get('usage') usage(@CurrentIdentity() who: Identity, @workspace() ws: string) { return this.files.usage(who, ws); }

  @Get('attachments') attachments(@CurrentIdentity() who: Identity, @workspace() ws: string, @Query('taskId') taskId?: string, @Query('documentId') documentId?: string, @Query('projectId') projectId?: string) { return this.files.attachments(who, ws, { taskId, documentId, projectId }); }
  @Post('attachments') attach(@CurrentIdentity() who: Identity, @workspace() ws: string, @Body() body: unknown) { return this.files.attach(who, ws, body); }
  @Delete('attachments/:attachmentId') detach(@CurrentIdentity() who: Identity, @workspace() ws: string, @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string) { return this.files.detach(who, ws, attachmentId); }

  @Post('folders') createFolder(@CurrentIdentity() who: Identity, @workspace() ws: string, @Body() body: unknown) { return this.files.createFolder(who, ws, body); }
  @Patch('folders/:folderId') renameFolder(@CurrentIdentity() who: Identity, @workspace() ws: string, @Param('folderId', new ParseUUIDPipe()) folderId: string, @Body() body: unknown) { return this.files.renameFolder(who, ws, folderId, body); }
  @Delete('folders/:folderId') deleteFolder(@CurrentIdentity() who: Identity, @workspace() ws: string, @Param('folderId', new ParseUUIDPipe()) folderId: string) { return this.files.deleteFolder(who, ws, folderId); }

  /** The request body is the file itself (any content type); name, folder and replace target are query parameters. */
  @Post('upload')
  @UseGuards(RateLimitGuard.strict(60)) // uploads are the heaviest request there is
  upload(@CurrentIdentity() who: Identity, @workspace() ws: string, @Req() request: Request, @Query('name') name?: string, @Query('folderId') folderId?: string, @Query('replaceFileId') replaceFileId?: string) {
    return this.files.upload(who, ws, request, { name, folderId, replaceFileId });
  }

  @Get(':fileId/download')
  async download(@CurrentIdentity() who: Identity, @workspace() ws: string, @Param('fileId', new ParseUUIDPipe()) fileId: string, @Res() response: Response, @Query('version') version?: string, @Query('inline') inline?: string) {
    const { stream, headers } = await this.files.download(who, ws, fileId, { version, inline });
    response.set(headers);
    await pipeline(stream, response);
  }

  @Get(':fileId/versions') versions(@CurrentIdentity() who: Identity, @workspace() ws: string, @Param('fileId', new ParseUUIDPipe()) fileId: string) { return this.files.versions(who, ws, fileId); }
  @Patch(':fileId') update(@CurrentIdentity() who: Identity, @workspace() ws: string, @Param('fileId', new ParseUUIDPipe()) fileId: string, @Body() body: unknown) { return this.files.updateFile(who, ws, fileId, body); }
  @Delete(':fileId') remove(@CurrentIdentity() who: Identity, @workspace() ws: string, @Param('fileId', new ParseUUIDPipe()) fileId: string) { return this.files.remove(who, ws, fileId); }
  @Post(':fileId/knowledge') toKnowledge(@CurrentIdentity() who: Identity, @workspace() ws: string, @Param('fileId', new ParseUUIDPipe()) id: string, @Body() body: unknown) { return this.files.addToKnowledge(who, ws, id, body); }
  @Post(':fileId/restore') restore(@CurrentIdentity() who: Identity, @workspace() ws: string, @Param('fileId', new ParseUUIDPipe()) fileId: string) { return this.files.restore(who, ws, fileId); }
  @Delete(':fileId/permanent') purge(@CurrentIdentity() who: Identity, @workspace() ws: string, @Param('fileId', new ParseUUIDPipe()) fileId: string) { return this.files.purge(who, ws, fileId); }
}
