import { Module } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { OpenAiCompatibleEmbeddings } from './embeddings.js';
import { SemanticController } from './semantic.controller.js';
import { SemanticService } from './semantic.service.js';
import { EMBEDDINGS } from './tokens.js';

@Module({
  controllers: [SemanticController],
  providers: [SemanticService, ClerkAuthGuard, { provide: EMBEDDINGS, useFactory: () => { const { embeddings } = readApiEnvironment(); return embeddings ? new OpenAiCompatibleEmbeddings(embeddings) : null; } }],
})
export class SemanticModule {}
