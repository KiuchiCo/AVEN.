import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { ExportModule } from '../export/export.module.js';
import { FilesModule } from '../files/files.module.js';
import { DocumentSharesController, PublicSharesController } from './sharing.controller.js';
import { SharingService } from './sharing.service.js';

@Module({ imports: [FilesModule, ExportModule], controllers: [DocumentSharesController, PublicSharesController], providers: [SharingService, ClerkAuthGuard] })
export class SharingModule {}
