import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

@Module({ controllers: [AuditController], providers: [AuditService, ClerkAuthGuard] })
export class AuditModule {}
