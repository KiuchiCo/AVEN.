import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
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

  /** The iPhone or iPad app tells the API where to send this person's notifications. */
  @Post('devices') @HttpCode(200) registerDevice(@CurrentIdentity() who: AuthenticatedIdentity, @Body() body: unknown) { return this.push.registerDevice(who, body); }
  @Delete('devices') removeDevice(@CurrentIdentity() who: AuthenticatedIdentity, @Body() body: unknown) { return this.push.removeDevice(who, body); }
}

/**
 * Stops notifications to a device without a sign-in: the app calls it as the person signs out, when their session is already gone. The device's own notification token is the proof
 * (it is known only to that device and this API), so it can stop notifications and nothing else; it is tightly rate limited.
 */
@Controller('push/devices')
export class PushDeviceUnregisterController {
  constructor(private readonly push: PushService) {}
  @Post('unregister') @HttpCode(200) @UseGuards(RateLimitGuard.strict(30)) unregister(@Body() body: unknown) { return this.push.unregisterDevice(body); }
}
