import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { AuditService } from './audit.service.js';

type Who = AuthenticatedIdentity;
const workspace = () => Param('workspaceId', new ParseUUIDPipe());

@Controller('workspaces/:workspaceId/audit')
@UseGuards(ClerkAuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get() list(@CurrentIdentity() who: Who, @workspace() ws: string, @Query() query: Record<string, unknown>) { return this.audit.list(who, ws, query); }
  @Get('people') people(@CurrentIdentity() who: Who, @workspace() ws: string) { return this.audit.actors(who, ws); }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(@CurrentIdentity() who: Who, @workspace() ws: string, @Query() query: Record<string, unknown>, @Res() response: Response) {
    const result = await this.audit.export(who, ws, query);
    response.setHeader('Content-Disposition', 'attachment; filename="aven-audit-log.csv"');
    response.setHeader('X-Row-Count', String(result.count)); response.setHeader('X-Truncated', String(result.truncated));
    response.send(result.csv);
  }
}
