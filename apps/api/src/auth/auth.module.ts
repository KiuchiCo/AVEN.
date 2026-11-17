import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { ClerkAuthGuard } from './clerk-auth.guard.js';
import { SessionController } from './session.controller.js';

@Module({
  controllers: [SessionController],
  providers: [AuthService, ClerkAuthGuard],
})
export class AuthModule {}
