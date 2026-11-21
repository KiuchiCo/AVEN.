import { Module } from '@nestjs/common';
import { AccountService } from './account.service.js';
import { AuthService } from './auth.service.js';
import { ClerkAuthGuard } from './clerk-auth.guard.js';
import { SessionController } from './session.controller.js';

@Module({
  controllers: [SessionController],
  providers: [AuthService, AccountService, ClerkAuthGuard],
})
export class AuthModule {}
