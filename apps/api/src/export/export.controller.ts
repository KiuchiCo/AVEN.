import { Controller, Get, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
import { ExportService } from './export.service.js';

/** Download a document the signed-in person can open as a PDF or a Word file. */
@Controller('workspaces/:workspaceId/documents/:documentId/export')
@UseGuards(ClerkAuthGuard, RateLimitGuard.strict(30))
export class DocumentExportController {
  constructor(private readonly exports: ExportService) {}

  @Get()
  async download(@CurrentIdentity() who: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('documentId', new ParseUUIDPipe()) documentId: string, @Query('format') format: string, @Res() response: Response) {
    const file = await this.exports.exportForMember(who, workspaceId, documentId, format);
    response.status(200).set(this.exports.headers(file)).end(file.body);
  }
}
