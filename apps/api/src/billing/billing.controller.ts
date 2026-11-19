import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { BillingService, type StripeEvent } from './billing.service.js';
import { verifyStripeSignature } from './stripe.js';

type Who = AuthenticatedIdentity;
const workspace = () => Param('workspaceId', new ParseUUIDPipe());

@Controller('workspaces/:workspaceId/billing')
@UseGuards(ClerkAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get() overview(@CurrentIdentity() who: Who, @workspace() ws: string) { return this.billing.overview(who, ws); }
  @Post('checkout') @HttpCode(200) checkout(@CurrentIdentity() who: Who, @workspace() ws: string, @Body() body: unknown) { return this.billing.checkout(who, ws, body); }
  @Post('portal') @HttpCode(200) portal(@CurrentIdentity() who: Who, @workspace() ws: string) { return this.billing.portal(who, ws); }
  @Post('sync-seats') @HttpCode(200) syncSeats(@CurrentIdentity() who: Who, @workspace() ws: string) { return this.billing.syncSeatsAsOwner(who, ws); }
}

/** Called by the payment provider, not by a signed-in person. Trust comes from the signature, never from the request itself. */
@Controller('billing')
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() request: Request & { rawBody?: Buffer }, @Headers('stripe-signature') signature?: string) {
    const { stripeWebhookSecret } = readApiEnvironment();
    if (!stripeWebhookSecret) throw new ServiceUnavailableException('Payments are not set up.');
    if (!request.rawBody || !verifyStripeSignature(request.rawBody, signature, stripeWebhookSecret)) throw new BadRequestException('The signature could not be verified.');
    const result = await this.billing.handleEvent(request.body as StripeEvent);
    return { received: true, ...result };
  }
}
