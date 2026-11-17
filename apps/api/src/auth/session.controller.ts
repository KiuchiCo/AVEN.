import { Controller, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from './clerk-auth.guard.js';
import { CurrentIdentity } from './current-identity.decorator.js';
import type { AuthenticatedIdentity } from './auth.types.js';
import { AuthService } from './auth.service.js';

@Controller('session')
@UseGuards(ClerkAuthGuard)
export class SessionController {
  constructor(private readonly authService: AuthService) {}

  @Post('bootstrap')
  bootstrap(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return this.authService.bootstrapWorkspace(identity);
  }
}
