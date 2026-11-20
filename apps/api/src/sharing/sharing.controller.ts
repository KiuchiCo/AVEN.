import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
import { parseFormat } from '../export/export.service.js';
import { SharingService } from './sharing.service.js';

type Who = AuthenticatedIdentity;
const workspace = () => Param('workspaceId', new ParseUUIDPipe());
const document = () => Param('documentId', new ParseUUIDPipe());
const share = () => Param('shareId', new ParseUUIDPipe());

@Controller('workspaces/:workspaceId/documents/:documentId/shares')
@UseGuards(ClerkAuthGuard)
export class DocumentSharesController {
  constructor(private readonly sharing: SharingService) {}
  @Get() list(@CurrentIdentity() who: Who, @workspace() ws: string, @document() doc: string) { return this.sharing.list(who, ws, doc); }
  @Post() create(@CurrentIdentity() who: Who, @workspace() ws: string, @document() doc: string, @Body() body: unknown) { return this.sharing.create(who, ws, doc, body); }
  @Patch(':shareId') update(@CurrentIdentity() who: Who, @workspace() ws: string, @document() doc: string, @share() id: string, @Body() body: unknown) { return this.sharing.update(who, ws, doc, id, body); }
  @Post(':shareId/regenerate') regenerate(@CurrentIdentity() who: Who, @workspace() ws: string, @document() doc: string, @share() id: string) { return this.sharing.regenerate(who, ws, doc, id); }
  @Delete(':shareId') revoke(@CurrentIdentity() who: Who, @workspace() ws: string, @document() doc: string, @share() id: string) { return this.sharing.revoke(who, ws, doc, id); }
}

const keepOut = (response: Response) => { response.setHeader('X-Robots-Tag', 'noindex, nofollow'); response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'no-referrer'); };

/** What a shared link opens. Public: the secret in the address is the only credential, and it grants read-only access to one document. */
@Controller('shared/documents')
@UseGuards(new RateLimitGuard(120))
export class PublicSharesController {
  constructor(private readonly sharing: SharingService) {}

  @Get(':token')
  async view(@Param('token') token: string, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    keepOut(response);
    return this.sharing.view(token, request.ip);
  }

  @Get(':token/images/:fileId')
  async image(@Param('token') token: string, @Param('fileId', new ParseUUIDPipe()) fileId: string, @Req() request: Request, @Res() response: Response) {
    const image = await this.sharing.image(token, fileId, request.ip);
    response.status(200).set({ 'Content-Type': image.mimeType, 'Content-Length': String(image.size), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Disposition': 'inline' });
    image.stream.pipe(response);
  }

  @Get(':token/export')
  @UseGuards(new RateLimitGuard(20))
  async download(@Param('token') token: string, @Query('format') format: string, @Req() request: Request, @Res() response: Response) {
    const file = await this.sharing.download(token, parseFormat(format), request.ip);
    response.status(200).set(this.sharing.headers(file)).end(file.body);
  }
}
