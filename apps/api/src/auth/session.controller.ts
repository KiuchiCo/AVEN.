import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from './clerk-auth.guard.js';
import { CurrentIdentity } from './current-identity.decorator.js';
import type { AuthenticatedIdentity } from './auth.types.js';
import { AuthService } from './auth.service.js';

@Controller('session')
@UseGuards(ClerkAuthGuard)
export class SessionController {
  constructor(private readonly authService: AuthService) {}

  @Post('bootstrap')
  bootstrap(@CurrentIdentity() identity: AuthenticatedIdentity, @Body() body: unknown) {
    const workspaceId = body && typeof body === 'object' && !Array.isArray(body) && 'workspaceId' in body ? (body as { workspaceId: unknown }).workspaceId : undefined;
    return this.authService.bootstrapWorkspace(identity, workspaceId);
  }

  @Get('workspaces')
  listWorkspaces(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return this.authService.listWorkspaces(identity);
  }

  @Post('workspaces')
  createWorkspace(@CurrentIdentity() identity: AuthenticatedIdentity, @Body() body: unknown) {
    return this.authService.createWorkspace(identity, body);
  }

  @Patch('workspaces/:workspaceId')
  renameWorkspace(@CurrentIdentity() identity: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Body() body: unknown) {
    return this.authService.renameWorkspace(identity, workspaceId, body);
  }
}
