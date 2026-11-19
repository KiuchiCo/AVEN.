import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { LocalStorageDriver } from './storage.js';
import { FILE_LIMITS, STORAGE } from './tokens.js';

@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    ClerkAuthGuard,
    { provide: STORAGE, useFactory: () => new LocalStorageDriver(readApiEnvironment().storageDir) },
    { provide: FILE_LIMITS, useFactory: () => { const { maxUploadBytes, storageQuotaBytes } = readApiEnvironment(); return { maxUploadBytes, storageQuotaBytes }; } },
  ],
  exports: [FilesService],
})
export class FilesModule {}
