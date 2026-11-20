import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { FilesModule } from '../files/files.module.js';
import { ProductivityModule } from '../productivity/productivity.module.js';
import { DocumentExportController } from './export.controller.js';
import { ExportService } from './export.service.js';

@Module({ imports: [FilesModule, ProductivityModule], controllers: [DocumentExportController], providers: [ExportService, ClerkAuthGuard], exports: [ExportService] })
export class ExportModule {}
