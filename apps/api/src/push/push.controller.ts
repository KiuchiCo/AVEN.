import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import { PushService } from './push.service.js';

@Controller('push')
@UseGuards(ClerkAuthGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('config') config() { return this.push.config(); }
  @Post('subscriptions') @HttpCode(200) subscribe(@CurrentIdentity() who: AuthenticatedIdentity, @Body() body: unknown) { return this.push.subscribe(who, body); }
  @Delete('subscriptions') unsubscribe(@CurrentIdentity() who: AuthenticatedIdentity, @Body() body: unknown) { return this.push.unsubscribe(who, body); }
}
