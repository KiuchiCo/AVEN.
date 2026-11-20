import { Global, Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { BillingController, BillingWebhookController } from './billing.controller.js';
import { BillingService, STRIPE } from './billing.service.js';
import { EntitlementsService } from './entitlements.service.js';
import { PermissionsService } from './permissions.service.js';
import { StripeClient } from './stripe.js';

/** Global so any module can ask what the workspace's plan allows. */
@Global()
@Module({
  controllers: [BillingController, BillingWebhookController],
  providers: [
    EntitlementsService, BillingService, PermissionsService, ClerkAuthGuard,
    // To use another payment provider, replace this with a client that has the same methods.
    { provide: STRIPE, useFactory: () => { const { stripeSecretKey, stripeBaseUrl } = readApiEnvironment(); return stripeSecretKey ? new StripeClient({ secretKey: stripeSecretKey, baseUrl: stripeBaseUrl }) : null; } },
  ],
  exports: [EntitlementsService, BillingService, PermissionsService],
})
export class BillingModule {}
