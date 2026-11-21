import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ClerkAuthGuard } from './clerk-auth.guard.js';
import { CurrentIdentity } from './current-identity.decorator.js';
import type { AuthenticatedIdentity } from './auth.types.js';
import { AuthService } from './auth.service.js';
import { AccountService } from './account.service.js';
import { RateLimitGuard } from '../common/rate-limit.guard.js';

@Controller('session')
@UseGuards(ClerkAuthGuard)
export class SessionController {
  constructor(private readonly authService: AuthService, private readonly account: AccountService) {}

  /** A copy of the person's own data, as a JSON download. */
  @Get('export')
  @UseGuards(RateLimitGuard.strict(10))
  async exportData(@CurrentIdentity() identity: AuthenticatedIdentity, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Content-Disposition', 'attachment; filename="aven-my-data.json"');
    response.setHeader('Cache-Control', 'private, no-store');
    return this.account.exportData(identity);
  }

  /** Deletes the account (see AccountService). The body must repeat the person's email address. */
  @Post('delete-account')
  @HttpCode(200)
  @UseGuards(RateLimitGuard.strict(5))
  deleteAccount(@CurrentIdentity() identity: AuthenticatedIdentity, @Body() body: unknown) {
    return this.account.deleteAccount(identity, body);
  }

  @Post('bootstrap')
  bootstrap(@CurrentIdentity() identity: AuthenticatedIdentity, @Body() body: unknown) {
    const workspaceId = body && typeof body === 'object' && !Array.isArray(body) && 'workspaceId' in body ? (body as { workspaceId: unknown }).workspaceId : undefined;
    return this.authService.bootstrapWorkspace(identity, workspaceId);
  }

  @Get('me')
  profile(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return this.authService.getProfile(identity);
  }

  @Patch('me')
  updateProfile(@CurrentIdentity() identity: AuthenticatedIdentity, @Body() body: unknown) {
    return this.authService.updateProfile(identity, body);
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
