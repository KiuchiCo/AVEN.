import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { SharingService } from './sharing.service.js';

type Who = AuthenticatedIdentity;
const workspace = () => Param('workspaceId', new ParseUUIDPipe());
const document = () => Param('documentId', new ParseUUIDPipe());

@Controller('workspaces/:workspaceId/documents/:documentId/shares')
@UseGuards(ClerkAuthGuard)
export class DocumentSharesController {
  constructor(private readonly sharing: SharingService) {}
  @Get() list(@CurrentIdentity() who: Who, @workspace() ws: string, @document() doc: string) { return this.sharing.list(who, ws, doc); }
  @Post() create(@CurrentIdentity() who: Who, @workspace() ws: string, @document() doc: string, @Body() body: unknown) { return this.sharing.create(who, ws, doc, body); }
  @Delete(':shareId') revoke(@CurrentIdentity() who: Who, @workspace() ws: string, @document() doc: string, @Param('shareId', new ParseUUIDPipe()) shareId: string) { return this.sharing.revoke(who, ws, doc, shareId); }
}

/** What a shared link opens. Public: the secret in the address is the only credential, and it grants read-only access to one document. */
@Controller('shared/documents')
export class PublicSharesController {
  constructor(private readonly sharing: SharingService) {}

  @Get(':token')
  async view(@Param('token') token: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader('X-Robots-Tag', 'noindex, nofollow'); response.setHeader('Cache-Control', 'no-store');
    return this.sharing.view(token);
  }

  @Get(':token/images/:fileId')
  async image(@Param('token') token: string, @Param('fileId', new ParseUUIDPipe()) fileId: string, @Res() response: Response) {
    const image = await this.sharing.image(token, fileId);
    response.status(200).set({ 'Content-Type': image.mimeType, 'Content-Length': String(image.size), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Disposition': 'inline' });
    image.stream.pipe(response);
  }
}
