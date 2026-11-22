import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { PushController, PushDeviceUnregisterController } from './push.controller.js';
import { PushService } from './push.service.js';
import { ApnsClient } from './apns.js';
import { APNS, PUSH_SETTINGS } from './tokens.js';

@Module({
  controllers: [PushController, PushDeviceUnregisterController],
  providers: [PushService, ClerkAuthGuard, { provide: APNS, useFactory: () => { const { apns } = readApiEnvironment(); return apns ? new ApnsClient(apns) : null; } }, { provide: PUSH_SETTINGS, useFactory: () => { const { push, workflowAllowPrivateWebhooks } = readApiEnvironment(); return push ? { ...push, allowPrivate: workflowAllowPrivateWebhooks } : null; } }],
  exports: [PushService],
})
export class PushModule {}
