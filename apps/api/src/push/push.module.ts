import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { PushController } from './push.controller.js';
import { PushService } from './push.service.js';
import { PUSH_SETTINGS } from './tokens.js';

@Module({
  controllers: [PushController],
  providers: [PushService, ClerkAuthGuard, { provide: PUSH_SETTINGS, useFactory: () => { const { push, workflowAllowPrivateWebhooks } = readApiEnvironment(); return push ? { ...push, allowPrivate: workflowAllowPrivateWebhooks } : null; } }],
  exports: [PushService],
})
export class PushModule {}
