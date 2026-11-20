import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { FavouritesController } from './favourites.controller.js';
import { FavouritesService } from './favourites.service.js';

@Module({ controllers: [FavouritesController], providers: [FavouritesService, ClerkAuthGuard] })
export class FavouritesModule {}
