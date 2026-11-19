import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PrismaModule } from './database/prisma.module.js';
import { FilesModule } from './files/files.module.js';
import { HealthController } from './health.controller.js';
import { ProductivityModule } from './productivity/productivity.module.js';

@Module({
  imports: [PrismaModule, AuthModule, ProductivityModule, FilesModule, AiModule],
  controllers: [HealthController],
})
export class AppModule {}
