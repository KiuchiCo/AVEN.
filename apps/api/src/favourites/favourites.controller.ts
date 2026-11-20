import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { CurrentIdentity } from '../auth/current-identity.decorator.js';
import type { AuthenticatedIdentity } from '../auth/auth.types.js';
import { FavouritesService } from './favourites.service.js';

@Controller('workspaces/:workspaceId/favourites')
@UseGuards(ClerkAuthGuard)
export class FavouritesController {
  constructor(private readonly favourites: FavouritesService) {}
  @Get() list(@CurrentIdentity() who: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) ws: string) { return this.favourites.list(who, ws); }
  @Post() @HttpCode(200) add(@CurrentIdentity() who: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) ws: string, @Body() body: unknown) { return this.favourites.add(who, ws, body); }
  @Delete() @HttpCode(200) remove(@CurrentIdentity() who: AuthenticatedIdentity, @Param('workspaceId', new ParseUUIDPipe()) ws: string, @Body() body: unknown) { return this.favourites.remove(who, ws, body); }
}
